        // MODULE: CÔNG VIỆC HÀNG NGÀY (WORK ORDER)
        // ================================================================

        const WO_TYPES = ['Bảo trì định kỳ', 'Sửa chữa', 'Kiểm tra', 'Vệ sinh', 'Hiệu chỉnh', 'Khác'];
        const WO_SHIFTS = { ca1: 'Ca 1', ca2: 'Ca 2', ca3: 'Ca 3', hc: 'Hành chính' };
        const WO_PRIORITIES = { normal: { label: 'Bình thường', cls: 'pri-normal' }, urgent: { label: 'Khẩn', cls: 'pri-urgent' }, critical: { label: 'Cấp cứu', cls: 'pri-critical' } };

        function loadWorkOrdersFromStorage() {
            try { const s = localStorage.getItem('workOrders'); if (s) workOrders = JSON.parse(s); } catch(e) {}
        }
        function saveWorkOrdersToStorage() {
            try {
                localStorage.setItem('workOrders', JSON.stringify(workOrders));
                if (appMode === 'drive' && driveWorkOrdersFolderId) driveSyncJsonFile(driveWorkOrdersFolderId, 'workOrders.json', workOrders);
            } catch(e) {}
        }

        function woGenId() { return 'WO' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase(); }

        function woTodayStr() {
            const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        }
        function woFmtDate(str) {
            if (!str) return '';
            const [y,m,d] = str.split('-'); return `${d}/${m}/${y}`;
        }
        function woFmtDayName(str) {
            if (!str) return '';
            const days = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
            const d = new Date(str + 'T00:00:00');
            return days[d.getDay()] + ', ' + woFmtDate(str);
        }

        function woGetOrders(dateStr) { return workOrders[dateStr] || []; }
        function woGetOrder(id, dateStr) {
            for (const d of (dateStr ? [dateStr] : Object.keys(workOrders))) {
                const found = (workOrders[d] || []).find(o => o.id === id);
                if (found) return { order: found, date: d };
            }
            return null;
        }

        // Tìm lệnh công việc (Việc ngày) đang liên kết với 1 dòng kế hoạch (chưa hoàn thành), để đồng bộ 2 chiều
        function woFindLinkedOrder(kind, planId) {
            for (const d of Object.keys(workOrders)) {
                const found = (workOrders[d] || []).find(o => o.sourceRef && o.sourceRef.kind === kind && o.sourceRef.planId === planId && o.status !== 'done');
                if (found) return found;
            }
            return null;
        }

        // Khi hoàn thành 1 dòng kế hoạch (cyclic/adhoc) trực tiếp từ tab Kế hoạch,
        // tự động đóng luôn lệnh công việc liên kết bên tab "Việc ngày" (nếu có) — đồng nhất 2 chiều.
        function woSyncLinkedOrderOnPlanComplete(kind, planId, details) {
            const o = woFindLinkedOrder(kind, planId);
            if (!o) return;
            o.status = 'done';
            if (!o.startedAt) o.startedAt = details.performedAt || new Date().toLocaleString('vi-VN');
            o.completedAt = details.performedAt || new Date().toLocaleString('vi-VN');
            if (!o.actualHours) o.actualHours = 0;
            o.completionNotes = details.notes || o.completionNotes || '';
            if (details.performedBy && !o.assignee) o.assignee = details.performedBy;
            saveWorkOrdersToStorage();
            if (currentMainTab === 'workorder') { renderWorkOrderPage(); if (woSelectedId === o.id) renderWoDetail(o); }
        }

        function initWorkOrderTab() {
            if (!woCurrentDate) woCurrentDate = woTodayStr();
            renderWorkOrderPage();
        }

        function woNavigateDay(delta) {
            if (delta === 0) { woCurrentDate = woTodayStr(); }
            else {
                const d = new Date(woCurrentDate + 'T00:00:00');
                d.setDate(d.getDate() + delta);
                woCurrentDate = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
            }
            woSelectedId = null;
            renderWorkOrderPage();
        }

        function renderWorkOrderPage() {
            const dateEl = document.getElementById('woDateDisplay');
            if (dateEl) dateEl.textContent = woFmtDayName(woCurrentDate);

            // Cập nhật dropdown nhân sự
            const personFilter = document.getElementById('woPersonFilter');
            if (personFilter) {
                const curVal = pendingAssigneeFilter || personFilter.value;
                personFilter.innerHTML = '<option value="all">Tất cả nhân sự</option>' +
                    personnelList.map(p => `<option value="${p.name}" ${curVal === p.name ? 'selected':''}>${p.name}</option>`).join('');
                if (pendingAssigneeFilter) {
                    personFilter.value = pendingAssigneeFilter;
                    personFilter.disabled = true;
                    personFilter.title = 'Đang khoá theo đường dẫn cá nhân — không thể đổi';
                }
            }

            const banner = document.getElementById('woLockedAssigneeBanner');
            if (banner) {
                if (pendingAssigneeFilter) {
                    banner.classList.remove('hidden');
                    banner.textContent = `🔒 Đang xem việc được giao cho: ${pendingAssigneeFilter} (đường dẫn cá nhân — không thấy việc của người khác)`;
                } else {
                    banner.classList.add('hidden');
                }
            }

            const shiftFilter = document.getElementById('woShiftFilter')?.value || 'all';
            const personFilterVal = pendingAssigneeFilter || personFilter?.value || 'all';

            let orders = woGetOrders(woCurrentDate).filter(o => {
                if (shiftFilter !== 'all' && o.shift !== shiftFilter) return false;
                if (personFilterVal !== 'all' && o.assignee !== personFilterVal) return false;
                return true;
            });

            const priOrder = { critical: 0, urgent: 1, normal: 2 };
            orders.sort((a,b) => (priOrder[a.priority]||2) - (priOrder[b.priority]||2));

            const pending = orders.filter(o => o.status === 'pending');
            const inprogress = orders.filter(o => o.status === 'inprogress');
            const done = orders.filter(o => o.status === 'done');

            // Stats bar
            const total = orders.length;
            const urgentCount = orders.filter(o => o.priority === 'critical' || o.priority === 'urgent').length;
            const rate = total > 0 ? Math.round(done.length / total * 100) : 0;
            const statsBar = document.getElementById('woStatsBar');
            if (statsBar) statsBar.innerHTML = `
                <div class="wo-stat-pill p-total"><span class="wo-stat-val">${total}</span> Tổng lệnh</div>
                <div class="wo-stat-pill p-pending"><span class="wo-stat-val">${pending.length}</span> Chờ</div>
                <div class="wo-stat-pill p-inprogress"><span class="wo-stat-val">${inprogress.length}</span> Đang làm</div>
                <div class="wo-stat-pill p-done"><span class="wo-stat-val">${done.length}</span> Hoàn thành</div>
                ${urgentCount > 0 ? `<div class="wo-stat-pill p-urgent"><span class="wo-stat-val">${urgentCount}</span> Khẩn/Cấp cứu</div>` : ''}
                <div class="wo-stat-pill p-rate"><span class="wo-stat-val">${rate}%</span> Tỷ lệ hoàn thành</div>
            `;

            // Badges
            document.getElementById('woBadgePending').textContent = pending.length;
            document.getElementById('woBadgeInprogress').textContent = inprogress.length;
            document.getElementById('woBadgeDone').textContent = done.length;

            // Render columns
            renderWoCol('woColPending', pending);
            renderWoCol('woColInprogress', inprogress);
            renderWoCol('woColDone', done);

            // Re-render detail panel if selection active
            if (woSelectedId) {
                const found = woGetOrder(woSelectedId, woCurrentDate);
                if (found) renderWoDetail(found.order);
                else { woSelectedId = null; renderWoDetailEmpty(); }
            }
        }

        function renderWoCol(colId, orders) {
            const col = document.getElementById(colId);
            if (!col) return;
            if (orders.length === 0) {
                col.innerHTML = `<div class="italic" style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:20px 0;">Không có lệnh nào</div>`;
                return;
            }
            col.innerHTML = orders.map(o => woCardHtml(o)).join('');
        }

        function woCardHtml(o) {
            const pri = WO_PRIORITIES[o.priority] || WO_PRIORITIES.normal;
            const shiftLabel = WO_SHIFTS[o.shift] || o.shift || '';
            let actionBtns = '';
            if (o.status === 'pending') {
                actionBtns = `
                    <button class="wo-action-btn to-progress" onclick="event.stopPropagation(); woSetStatus('${o.id}','inprogress')">▶ Bắt đầu</button>
                    <button class="wo-action-btn to-done" onclick="event.stopPropagation(); woSetStatus('${o.id}','done')">✓ Hoàn thành</button>
                    <button class="wo-action-btn wo-del" onclick="event.stopPropagation(); woDelete('${o.id}')">✕</button>
                `;
            } else if (o.status === 'inprogress') {
                actionBtns = `
                    <button class="wo-action-btn to-back" onclick="event.stopPropagation(); woSetStatus('${o.id}','pending')">↩ Hoàn tác</button>
                    <button class="wo-action-btn to-done" onclick="event.stopPropagation(); woOpenCompleteModal('${o.id}')">✓ Hoàn thành</button>
                `;
            } else {
                actionBtns = `
                    <button class="wo-action-btn to-back" onclick="event.stopPropagation(); woSetStatus('${o.id}','inprogress')">↩ Mở lại</button>
                    <button class="wo-action-btn wo-del" onclick="event.stopPropagation(); woDelete('${o.id}')">✕</button>
                `;
            }
            return `
                <div class="wo-card ${pri.cls} ${woSelectedId === o.id ? 'selected':''}" onclick="woSelectCard('${o.id}')">
                    <div class="wo-card-top">
                        <span class="wo-card-id">${o.id}</span>
                        <span class="wo-pri-badge ${pri.cls}">${pri.label}</span>
                    </div>
                    <div class="wo-card-title">${o.title || '(Chưa có tiêu đề)'}</div>
                    ${o.device ? `<div class="wo-card-device">⚙️ ${o.device}${o.deviceName ? ' — ' + o.deviceName : ''}</div>` : ''}
                    <div class="wo-card-meta">
                        ${o.type ? `<span class="wo-card-tag t-type">${o.type}</span>` : ''}
                        ${shiftLabel ? `<span class="wo-card-tag t-shift">${shiftLabel}</span>` : ''}
                        ${o.assignee ? `<span class="wo-card-tag t-person">👤 ${o.assignee}</span>` : ''}
                        ${o.estHours ? `<span class="wo-card-tag t-time">⏱ ${o.estHours}h</span>` : ''}
                        ${o.status === 'done' && o.completedAt ? `<span class="wo-card-tag" style="color:var(--color-emerald);">✓ ${o.completedAt.slice(11,16)}</span>` : ''}
                    </div>
                    <div class="wo-card-actions">${actionBtns}</div>
                </div>
            `;
        }

        function woSelectCard(id) {
            woSelectedId = (woSelectedId === id) ? null : id;
            renderWorkOrderPage();
            const panel = document.getElementById('woDetailPanel');
            if (woSelectedId) {
                const found = woGetOrder(woSelectedId);
                if (found) renderWoDetail(found.order);
                if (panel) panel.classList.add('wo-detail-open');
            } else {
                renderWoDetailEmpty();
                if (panel) panel.classList.remove('wo-detail-open');
            }
        }

        function renderWoDetailEmpty() {
            const panel = document.getElementById('woDetailPanel');
            if (!panel) return;
            panel.innerHTML = `
                <div class="wo-detail-empty">
                    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>
                    <p>Chọn một lệnh công việc<br>để xem chi tiết</p>
                </div>
            `;
        }

        function renderWoDetail(o) {
            const panel = document.getElementById('woDetailPanel');
            if (!panel) return;
            const pri = WO_PRIORITIES[o.priority] || WO_PRIORITIES.normal;
            const statusMap = { pending: 'Chờ thực hiện', inprogress: 'Đang thực hiện', done: 'Đã hoàn thành' };
            const activeMap = { pending: 'active-pending', inprogress: 'active-inprogress', done: 'active-done' };

            panel.innerHTML = `
                <button class="wo-detail-close-mobile" onclick="woSelectCard('${o.id}')">✕ Đóng, quay lại danh sách</button>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <span style="font-size:0.8rem; font-weight:800; color:white;">${o.id}</span>
                    <span class="wo-pri-badge ${pri.cls}">${pri.label}</span>
                </div>

                <div class="wo-detail-section">
                    <div class="wo-detail-section-title">Trạng thái</div>
                    <div class="wo-detail-status-row">
                        <button class="wo-detail-status-btn ${o.status==='pending'?'active-pending':''}" onclick="woSetStatus('${o.id}','pending')">Chờ</button>
                        <button class="wo-detail-status-btn ${o.status==='inprogress'?'active-inprogress':''}" onclick="woSetStatus('${o.id}','inprogress')">Đang làm</button>
                        <button class="wo-detail-status-btn ${o.status==='done'?'active-done':''}" onclick="woOpenCompleteModal('${o.id}')">Hoàn thành</button>
                    </div>
                </div>

                <div class="wo-detail-section">
                    <div class="wo-detail-section-title">Thông tin chung</div>
                    <div class="wo-detail-field"><div class="wo-detail-label">Tiêu đề</div><div class="wo-detail-value">${o.title || '—'}</div></div>
                    <div class="wo-detail-field"><div class="wo-detail-label">Loại công việc</div><div class="wo-detail-value">${o.type || '—'}</div></div>
                    <div class="wo-detail-field"><div class="wo-detail-label">Thiết bị</div><div class="wo-detail-value">${o.device ? `${o.device}${o.deviceName ? ' — '+o.deviceName : ''}` : '—'}</div></div>
                    <div class="wo-detail-field"><div class="wo-detail-label">Ca thực hiện</div><div class="wo-detail-value">${WO_SHIFTS[o.shift] || o.shift || '—'}</div></div>
                    <div class="wo-detail-field"><div class="wo-detail-label">Người phụ trách</div><div class="wo-detail-value">${o.assignee || '—'}</div></div>
                    <div class="wo-detail-field"><div class="wo-detail-label">Thời gian dự kiến</div><div class="wo-detail-value">${o.estHours ? o.estHours + ' giờ' : '—'}</div></div>
                    ${o.description ? `<div class="wo-detail-field"><div class="wo-detail-label">Mô tả</div><div class="wo-detail-value" style="white-space:pre-wrap; font-size:0.75rem;">${o.description}</div></div>` : ''}
                </div>

                ${o.status === 'done' ? `
                <div class="wo-detail-section">
                    <div class="wo-detail-section-title">Kết quả thực hiện</div>
                    <div class="wo-detail-field"><div class="wo-detail-label">Thời gian bắt đầu</div><div class="wo-detail-value">${o.startedAt || '—'}</div></div>
                    <div class="wo-detail-field"><div class="wo-detail-label">Thời gian hoàn thành</div><div class="wo-detail-value">${o.completedAt || '—'}</div></div>
                    <div class="wo-detail-field"><div class="wo-detail-label">Thời gian thực tế</div><div class="wo-detail-value">${o.actualHours ? o.actualHours + ' giờ' : '—'}</div></div>
                    ${o.completionNotes ? `<div class="wo-detail-field"><div class="wo-detail-label">Ghi chú hoàn thành</div><div class="wo-detail-value" style="white-space:pre-wrap; font-size:0.75rem;">${o.completionNotes}</div></div>` : ''}
                </div>` : ''}

                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-slate" style="padding:6px 10px; font-size:0.72rem; flex:1;" onclick="openEditWorkOrder('${o.id}')">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:3px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Chỉnh sửa
                    </button>
                    <button class="btn btn-slate" style="padding:6px 10px; font-size:0.72rem; flex:1;" onclick="woPrintShiftReport()">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:3px;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        In báo cáo ca
                    </button>
                </div>

                ${o.status !== 'done' ? `
                <div style="margin-top:auto; padding-top:8px; border-top:1px solid var(--border-color);">
                    <button class="btn" style="padding:6px 10px; font-size:0.72rem; background:rgba(239,68,68,0.12); color:var(--color-rose); border:1px solid rgba(239,68,68,0.3); width:100%;" onclick="woDelete('${o.id}')">
                        Xóa lệnh công việc
                    </button>
                </div>` : ''}
            `;
        }

        function woSetStatus(id, newStatus) {
            const found = woGetOrder(id);
            if (!found) return;
            const o = found.order;
            if (newStatus === 'done') { woOpenCompleteModal(id); return; }
            const now = new Date().toLocaleString('vi-VN');
            if (newStatus === 'inprogress' && !o.startedAt) o.startedAt = now;
            o.status = newStatus;
            saveWorkOrdersToStorage();
            renderWorkOrderPage();
            if (woSelectedId === id) renderWoDetail(o);
        }

        function woDelete(id) {
            showDeleteConfirm('Xóa lệnh công việc này?', () => {
                Object.keys(workOrders).forEach(d => {
                    workOrders[d] = workOrders[d].filter(o => o.id !== id);
                });
                if (woSelectedId === id) { woSelectedId = null; renderWoDetailEmpty(); }
                saveWorkOrdersToStorage();
                renderWorkOrderPage();
            });
        }

        // Modal tạo / sửa lệnh
        function buildWoDeviceOptions(selected) {
            const opts = ['<option value="">— Không gắn thiết bị —</option>'];
            allValidRows.forEach(d => {
                opts.push(`<option value="${d.item || ''}" data-name="${(d.name||'').replace(/"/g,'&quot;')}" ${(d.item||'') === selected ? 'selected':''}>${d.item || ''}${d.name ? ' — ' + d.name : ''}</option>`);
            });
            return opts.join('');
        }

        // Tạo lệnh công việc (Work Order) prefill từ 1 dòng trong Kế hoạch bảo trì (định kỳ hoặc đột xuất)
        function createWorkOrderFromPlanItem(planId, kind) {
            const p = kind === 'cyclic'
                ? maintPlan.find(x => x.planId === planId)
                : adhocPlan.find(x => x.planId === planId);
            if (!p) { alert('Không tìm thấy hạng mục kế hoạch này!'); return; }

            const prefill = {
                title: kind === 'cyclic'
                    ? `${p.cycleLabel} — ${p.item}${p.name ? ' (' + p.name + ')' : ''}`
                    : `Bảo trì đột xuất — ${p.item}${p.name ? ' (' + p.name + ')' : ''}`,
                type: kind === 'cyclic' ? 'Bảo trì định kỳ' : 'Sửa chữa',
                priority: kind === 'adhoc' ? (p.priority >= 3 ? 'critical' : (p.priority >= 2 ? 'urgent' : 'normal')) : 'normal',
                date: (kind === 'cyclic' ? p.scheduledDate : null) || woCurrentDate || woTodayStr(),
                assignee: p.assignedTo || '',
                device: p.item || '',
                description: p.jobText || '',
                sourceRef: { planId, kind }
            };
            openCreateWorkOrder(prefill);
        }

        function openCreateWorkOrder(prefill) {
            prefill = prefill || {};
            window._woPendingSourceRef = prefill.sourceRef || null;
            const modal = document.createElement('div');
            modal.className = 'wo-modal-overlay';
            modal.id = 'woCreateModal';
            modal.innerHTML = `
                <div class="wo-modal">
                    <div class="wo-modal-header">
                        <span class="wo-modal-title">➕ Tạo lệnh công việc</span>
                        <button class="close-modal" onclick="document.getElementById('woCreateModal').remove()">✖</button>
                    </div>
                    <div class="wo-modal-body">
                        <div class="wo-form-field">
                            <label>Tiêu đề công việc *</label>
                            <input id="woF_title" class="search-input" placeholder="Mô tả ngắn gọn công việc cần làm..." value="${prefill.title||''}">
                        </div>
                        <div class="wo-form-row">
                            <div class="wo-form-field">
                                <label>Loại công việc</label>
                                <select id="woF_type" class="search-input">
                                    ${WO_TYPES.map(t=>`<option value="${t}" ${t===(prefill.type||'Bảo trì định kỳ')?'selected':''}>${t}</option>`).join('')}
                                </select>
                            </div>
                            <div class="wo-form-field">
                                <label>Độ ưu tiên</label>
                                <select id="woF_priority" class="search-input">
                                    <option value="normal" ${(prefill.priority||'normal')==='normal'?'selected':''}>Bình thường</option>
                                    <option value="urgent" ${prefill.priority==='urgent'?'selected':''}>Khẩn</option>
                                    <option value="critical" ${prefill.priority==='critical'?'selected':''}>Cấp cứu</option>
                                </select>
                            </div>
                        </div>
                        <div class="wo-form-row">
                            <div class="wo-form-field">
                                <label>Ngày thực hiện</label>
                                <input id="woF_date" type="date" class="search-input" value="${prefill.date||woCurrentDate}">
                            </div>
                            <div class="wo-form-field">
                                <label>Ca thực hiện</label>
                                <select id="woF_shift" class="search-input">
                                    <option value="">— Chọn ca —</option>
                                    ${Object.entries(WO_SHIFTS).map(([k,v])=>`<option value="${k}" ${(prefill.shift||'')=== k?'selected':''}>${v}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="wo-form-row">
                            <div class="wo-form-field">
                                <label>Người phụ trách</label>
                                <select id="woF_assignee" class="search-input">
                                    <option value="">— Chưa phân công —</option>
                                    ${personnelList.map(p=>`<option value="${p.name}" ${p.name===(prefill.assignee||'')?'selected':''}>${p.name}${p.position?' — '+p.position:''}</option>`).join('')}
                                </select>
                            </div>
                            <div class="wo-form-field">
                                <label>Thời gian dự kiến (giờ)</label>
                                <input id="woF_estHours" type="number" min="0.5" max="24" step="0.5" class="search-input" placeholder="Vd: 2" value="${prefill.estHours||''}">
                            </div>
                        </div>
                        <div class="wo-form-field">
                            <label>Thiết bị liên quan</label>
                            <select id="woF_device" class="search-input" onchange="woSyncDeviceName(this)">
                                ${buildWoDeviceOptions(prefill.device||'')}
                            </select>
                        </div>
                        <div class="wo-form-field">
                            <label>Mô tả chi tiết</label>
                            <textarea id="woF_description" class="search-input" placeholder="Nội dung công việc, hướng dẫn thực hiện, lưu ý an toàn...">${prefill.description||''}</textarea>
                        </div>
                    </div>
                    <div class="wo-modal-footer">
                        <button class="btn btn-slate" onclick="document.getElementById('woCreateModal').remove()">Hủy</button>
                        <button class="btn btn-sky" onclick="woSaveNewOrder()">Tạo lệnh công việc</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById('woF_title').focus();
        }

        function woSyncDeviceName(sel) {
            const opt = sel.options[sel.selectedIndex];
            window._woPendingDeviceName = opt ? (opt.getAttribute('data-name') || '') : '';
        }

        function woSaveNewOrder() {
            const title = document.getElementById('woF_title')?.value.trim();
            if (!title) { alert('Vui lòng nhập tiêu đề công việc!'); return; }
            const date = document.getElementById('woF_date')?.value || woCurrentDate;
            const deviceSel = document.getElementById('woF_device');
            const deviceOpt = deviceSel?.options[deviceSel.selectedIndex];
            const order = {
                id: woGenId(),
                title,
                type: document.getElementById('woF_type')?.value || '',
                priority: document.getElementById('woF_priority')?.value || 'normal',
                shift: document.getElementById('woF_shift')?.value || '',
                assignee: document.getElementById('woF_assignee')?.value || '',
                estHours: parseFloat(document.getElementById('woF_estHours')?.value) || 0,
                device: deviceSel?.value || '',
                deviceName: deviceOpt ? (deviceOpt.getAttribute('data-name') || '') : '',
                description: document.getElementById('woF_description')?.value.trim() || '',
                status: 'pending',
                source: 'manual',
                sourceRef: window._woPendingSourceRef || null,
                createdAt: new Date().toLocaleString('vi-VN'),
                startedAt: '', completedAt: '', actualHours: 0, completionNotes: ''
            };
            window._woPendingSourceRef = null;
            if (!workOrders[date]) workOrders[date] = [];
            workOrders[date].push(order);
            saveWorkOrdersToStorage();
            document.getElementById('woCreateModal')?.remove();
            woCurrentDate = date;
            woSelectedId = order.id;
            renderWorkOrderPage();
            renderWoDetail(order);
        }

        function openEditWorkOrder(id) {
            const found = woGetOrder(id);
            if (!found) return;
            const o = found.order;
            document.getElementById('woCreateModal')?.remove();
            const modal = document.createElement('div');
            modal.className = 'wo-modal-overlay';
            modal.id = 'woCreateModal';
            modal.innerHTML = `
                <div class="wo-modal">
                    <div class="wo-modal-header">
                        <span class="wo-modal-title">✏️ Chỉnh sửa lệnh ${o.id}</span>
                        <button class="close-modal" onclick="document.getElementById('woCreateModal').remove()">✖</button>
                    </div>
                    <div class="wo-modal-body">
                        <div class="wo-form-field">
                            <label>Tiêu đề công việc *</label>
                            <input id="woF_title" class="search-input" value="${o.title||''}">
                        </div>
                        <div class="wo-form-row">
                            <div class="wo-form-field">
                                <label>Loại công việc</label>
                                <select id="woF_type" class="search-input">${WO_TYPES.map(t=>`<option value="${t}" ${t===o.type?'selected':''}>${t}</option>`).join('')}</select>
                            </div>
                            <div class="wo-form-field">
                                <label>Độ ưu tiên</label>
                                <select id="woF_priority" class="search-input">
                                    <option value="normal" ${o.priority==='normal'?'selected':''}>Bình thường</option>
                                    <option value="urgent" ${o.priority==='urgent'?'selected':''}>Khẩn</option>
                                    <option value="critical" ${o.priority==='critical'?'selected':''}>Cấp cứu</option>
                                </select>
                            </div>
                        </div>
                        <div class="wo-form-row">
                            <div class="wo-form-field">
                                <label>Ca thực hiện</label>
                                <select id="woF_shift" class="search-input">
                                    <option value="">— Chọn ca —</option>
                                    ${Object.entries(WO_SHIFTS).map(([k,v])=>`<option value="${k}" ${o.shift===k?'selected':''}>${v}</option>`).join('')}
                                </select>
                            </div>
                            <div class="wo-form-field">
                                <label>Người phụ trách</label>
                                <select id="woF_assignee" class="search-input">
                                    <option value="">— Chưa phân công —</option>
                                    ${personnelList.map(p=>`<option value="${p.name}" ${p.name===o.assignee?'selected':''}>${p.name}${p.position?' — '+p.position:''}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="wo-form-row">
                            <div class="wo-form-field">
                                <label>Thời gian dự kiến (giờ)</label>
                                <input id="woF_estHours" type="number" min="0.5" max="24" step="0.5" class="search-input" value="${o.estHours||''}">
                            </div>
                            <div class="wo-form-field">
                                <label>Thiết bị liên quan</label>
                                <select id="woF_device" class="search-input">${buildWoDeviceOptions(o.device||'')}</select>
                            </div>
                        </div>
                        <div class="wo-form-field">
                            <label>Mô tả chi tiết</label>
                            <textarea id="woF_description" class="search-input">${o.description||''}</textarea>
                        </div>
                    </div>
                    <div class="wo-modal-footer">
                        <button class="btn btn-slate" onclick="document.getElementById('woCreateModal').remove()">Hủy</button>
                        <button class="btn btn-sky" onclick="woSaveEdit('${id}')">Lưu thay đổi</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function woSaveEdit(id) {
            const found = woGetOrder(id);
            if (!found) return;
            const o = found.order;
            const title = document.getElementById('woF_title')?.value.trim();
            if (!title) { alert('Vui lòng nhập tiêu đề!'); return; }
            const deviceSel = document.getElementById('woF_device');
            const deviceOpt = deviceSel?.options[deviceSel.selectedIndex];
            o.title = title;
            o.type = document.getElementById('woF_type')?.value || o.type;
            o.priority = document.getElementById('woF_priority')?.value || o.priority;
            o.shift = document.getElementById('woF_shift')?.value || '';
            o.assignee = document.getElementById('woF_assignee')?.value || '';
            o.estHours = parseFloat(document.getElementById('woF_estHours')?.value) || 0;
            o.device = deviceSel?.value || '';
            o.deviceName = deviceOpt ? (deviceOpt.getAttribute('data-name') || '') : '';
            o.description = document.getElementById('woF_description')?.value.trim() || '';
            saveWorkOrdersToStorage();
            document.getElementById('woCreateModal')?.remove();
            renderWorkOrderPage();
            renderWoDetail(o);
        }

        // Modal đóng lệnh (nhập kết quả)
        function woOpenCompleteModal(id) {
            const found = woGetOrder(id);
            if (!found) return;
            const o = found.order;
            document.getElementById('woCompleteModal')?.remove();
            const modal = document.createElement('div');
            modal.className = 'wo-modal-overlay';
            modal.id = 'woCompleteModal';
            const now = new Date();
            const pad = n => String(n).padStart(2,'0');
            const defaultDT = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

            // Xác định xem lệnh này có liên kết với kế hoạch bảo trì không
            const ref = o.sourceRef;
            const planItem = ref
                ? (ref.kind === 'cyclic' ? maintPlan.find(p => p.planId === ref.planId) : adhocPlan.find(p => p.planId === ref.planId))
                : null;
            const hasRef = !!planItem;
            const kindLabel = ref && ref.kind === 'adhoc' ? 'bảo trì đột xuất' : 'bảo trì định kỳ';

            // Banner thông báo tích hợp (chỉ hiện khi có kế hoạch liên kết)
            const refBanner = hasRef ? `
                <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:6px; padding:8px 12px; margin-bottom:14px; font-size:0.78rem;">
                    <strong style="color:var(--color-emerald);">⛓ Liên kết kế hoạch ${kindLabel}</strong><br>
                    <span style="color:var(--text-muted);">Hoàn thành lệnh này sẽ đồng thời ghi nhận hoàn thành <strong style="color:white;">${planItem.item}${planItem.name ? ' — ' + planItem.name : ''}</strong> trong tab Kế hoạch, cập nhật ngày bảo trì cuối và ghi vào Nhật ký thiết bị.</span>
                </div>` : '';

            // Form nhật ký đầy đủ (chỉ hiện khi có kế hoạch liên kết)
            const logFormHtml = hasRef ? `
                <hr style="border:0; border-top:1px solid var(--border-color); margin:14px 0 12px;">
                <div style="font-size:0.7rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">📋 Thông tin ghi nhật ký bảo trì</div>
                <div class="wo-form-row">
                    <div class="wo-form-field">
                        <label>Người thực hiện *</label>
                        <select id="woC_performedBy" class="search-input" required>${personnelOptionsHtml(o.assignee)}</select>
                    </div>
                    <div class="wo-form-field">
                        <label>Người kiểm tra / giám sát</label>
                        <select id="woC_checkedBy" class="search-input">${personnelOptionsHtml('')}</select>
                    </div>
                </div>
                <div class="wo-form-field">
                    <label>Vật tư thay thế</label>
                    <textarea id="woC_materials" class="search-input" style="min-height:52px;" placeholder="VD: 2x vòng bi 6205, 1x dây curoa..."></textarea>
                </div>
                <div class="wo-form-row">
                    <div class="wo-form-field">
                        <label>Kết quả *</label>
                        <select id="woC_result" class="search-input" required>
                            <option value="pass">✅ Đạt</option>
                            <option value="note">⚠️ Đạt, có lưu ý</option>
                            <option value="fail">❌ Không đạt</option>
                        </select>
                    </div>
                    <div class="wo-form-field">
                        <label>Thời gian dừng máy (phút)</label>
                        <input id="woC_downtime" type="number" min="0" class="search-input" placeholder="0">
                    </div>
                </div>
                <div class="wo-form-field">
                    <label style="display:flex; align-items:center; gap:6px; text-transform:none; font-weight:600; color:var(--text-muted); font-size:0.72rem; margin-top:4px;">
                        <input type="checkbox" id="woC_addRCA" style="width:14px; height:14px; accent-color:var(--color-rose);">
                        <span style="color:var(--color-rose);">🔍 Tạo phiếu RCA từ lệnh công việc này</span>
                    </label>
                </div>
                ${ref.kind === 'cyclic' ? `
                <div class="wo-form-field">
                    <label style="display:flex; align-items:center; gap:6px; text-transform:none; font-weight:600; color:var(--text-muted); font-size:0.72rem;">
                        <input type="checkbox" id="woC_pushAdhoc" style="width:14px; height:14px; accent-color:var(--color-amber);">
                        <span style="color:var(--color-amber);">⚠️ Phát hiện hư hỏng — đẩy sang Bảo trì đột xuất</span>
                    </label>
                </div>` : ''}` : `
                <div class="wo-form-field" style="margin-top:4px;">
                    <label style="display:flex; align-items:center; gap:6px; text-transform:none; font-weight:600; color:var(--text-muted); font-size:0.72rem;">
                        <input type="checkbox" id="woC_createRca" style="width:14px; height:14px; accent-color:var(--color-rose);">
                        Tạo phiếu RCA từ lệnh công việc này
                    </label>
                </div>
                <div class="wo-form-field">
                    <label style="display:flex; align-items:center; gap:6px; text-transform:none; font-weight:600; color:var(--text-muted); font-size:0.72rem;">
                        <input type="checkbox" id="woC_pushAdhoc2" style="width:14px; height:14px; accent-color:var(--color-amber);">
                        <span style="color:var(--color-amber);">⚠️ Phát hiện hư hỏng — đẩy sang Bảo trì đột xuất</span>
                    </label>
                </div>`;

            modal.innerHTML = `
                <div class="wo-modal" style="max-width:500px;">
                    <div class="wo-modal-header">
                        <span class="wo-modal-title">✅ Hoàn thành lệnh</span>
                        <button class="close-modal" onclick="document.getElementById('woCompleteModal').remove()">✖</button>
                    </div>
                    <div class="wo-modal-body">
                        <div style="font-size:0.85rem; font-weight:700; color:white; margin-bottom:2px;">${o.title}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:12px;">${o.device||''}${o.deviceName?' — '+o.deviceName:''}</div>
                        ${refBanner}
                        <div class="wo-form-row">
                            <div class="wo-form-field">
                                <label>Giờ bắt đầu thực tế</label>
                                <input id="woC_startedAt" class="search-input" placeholder="Vd: 08:30" value="${o.startedAt||''}">
                            </div>
                            <div class="wo-form-field">
                                <label>Thời gian thực tế (giờ)</label>
                                <input id="woC_actualHours" type="number" min="0" step="0.25" class="search-input" placeholder="Vd: 1.5" value="${o.actualHours||''}">
                            </div>
                        </div>
                        <div class="wo-form-field">
                            <label>Ghi chú kết quả thực hiện</label>
                            <textarea id="woC_notes" class="search-input" placeholder="Đã thực hiện những gì, phát hiện vấn đề gì...">${o.completionNotes||''}</textarea>
                        </div>
                        ${logFormHtml}
                    </div>
                    <div class="wo-modal-footer">
                        <button class="btn btn-slate" onclick="document.getElementById('woCompleteModal').remove()">Hủy</button>
                        <button class="btn btn-emerald" onclick="woConfirmComplete('${id}')">✅ Xác nhận hoàn thành</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function woConfirmComplete(id) {
            const found = woGetOrder(id);
            if (!found) return;
            const o = found.order;
            const now = new Date().toLocaleString('vi-VN');

            // Đọc TOÀN BỘ giá trị các trường trong form (kể cả checkbox "Tạo phiếu RCA")
            // TRƯỚC KHI xoá modal khỏi DOM — nếu đọc sau khi xoá, mọi giá trị sẽ luôn rỗng/false.
            const performedBy = document.getElementById('woC_performedBy')?.value.trim() || o.assignee || '';
            const checkedBy   = document.getElementById('woC_checkedBy')?.value.trim()   || '';
            const materials   = document.getElementById('woC_materials')?.value.trim()   || '';
            const result      = document.getElementById('woC_result')?.value              || 'pass';
            const downtime    = document.getElementById('woC_downtime')?.value.trim()     || '';
            const wantsRCA    = !!(document.getElementById('woC_addRCA')?.checked || document.getElementById('woC_createRca')?.checked);
            const wantsAdhoc  = !!(document.getElementById('woC_pushAdhoc')?.checked || document.getElementById('woC_pushAdhoc2')?.checked);

            // Thu thập thông tin cơ bản của lệnh
            o.status = 'done';
            if (!o.startedAt) o.startedAt = document.getElementById('woC_startedAt')?.value || now;
            o.completedAt = now;
            o.actualHours = parseFloat(document.getElementById('woC_actualHours')?.value) || 0;
            o.completionNotes = document.getElementById('woC_notes')?.value.trim() || '';
            saveWorkOrdersToStorage();
            document.getElementById('woCompleteModal')?.remove();

            // Kiểm tra có liên kết kế hoạch bảo trì không
            const ref = o.sourceRef;
            const planItem = ref
                ? (ref.kind === 'cyclic' ? maintPlan.find(p => p.planId === ref.planId) : adhocPlan.find(p => p.planId === ref.planId))
                : null;

            if (planItem) {
                // ── CÓ LIÊN KẾT: gọi đúng luồng xác nhận hoàn thành của kế hoạch ──
                const performedAt = (() => {
                    const d = new Date();
                    const pad = n => String(n).padStart(2,'0');
                    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                })();
                const notes = o.completionNotes;

                if (ref.kind === 'cyclic') {
                    // Cập nhật ngày bảo trì cuối trong file Excel
                    applyMaintenanceCompletion(planItem.rowIdx, planItem.cycleType, performedAt);
                    // Ghi nhật ký thiết bị
                    addDeviceLogEntry(planItem.item, {
                        id: Date.now() + Math.random().toString(36).substr(2,5),
                        performedAt, cycleType: planItem.cycleType, cycleLabel: planItem.cycleLabel,
                        jobText: planItem.jobText || '', materials, performedBy, checkedBy,
                        result, downtimeMinutes: downtime, notes, recordedAt: getCurrentTimestamp()
                    });
                    writeDeviceLogFile(planItem.item);
                    setUnsavedFlag(true);
                    maintPlan = maintPlan.filter(p => p.planId !== ref.planId);
                    savePlanToLocalStorage();
                    processDataset();
                    renderMaintPlan();
                } else {
                    // adhoc
                    const adhocLogEntry = {
                        id: Date.now() + Math.random().toString(36).substr(2,5),
                        performedAt, cycleType: 'adhoc', cycleLabel: '🔧 Bảo trì đột xuất',
                        jobText: planItem.jobText || '', materials, performedBy, checkedBy,
                        result, downtimeMinutes: downtime, notes, recordedAt: getCurrentTimestamp()
                    };
                    addDeviceLogEntry(planItem.item, adhocLogEntry);
                    writeDeviceLogFile(planItem.item);
                    archiveAdhocCompletion(planItem, adhocLogEntry);
                    removeFromAdhocPlan(ref.planId);
                    processDataset();
                }

                renderWorkOrderPage();
                renderWoDetail(o);

                if (wantsRCA) {
                    const r = createRcaRecord(
                        { rowIdx: planItem.rowIdx, item: planItem.item, name: planItem.name, area: planItem.area },
                        notes || planItem.jobText || '',
                        ref.kind,
                        `${ref.kind === 'adhoc' ? 'Bảo trì đột xuất' : planItem.cycleLabel} — hoàn thành ${performedAt} (Lệnh ${o.id})`
                    );
                    if (r) { switchMainTab('rca'); setTimeout(() => { renderRcaList(); openRcaEditor(r.id); }, 300); }
                }
                if (wantsAdhoc && ref.kind === 'cyclic') {
                    pushWoFindingToAdhocPlan(
                        planItem.item, planItem.name,
                        `Phát hiện qua bảo trì ${planItem.cycleLabel || ''} (Lệnh ${o.id}): ${notes || ''}`.trim(),
                        `Đẩy từ lệnh công việc ${o.id} — ${performedAt}`
                    );
                    alert('⚠️ Đã thêm vào Kế hoạch bảo trì đột xuất để theo dõi tiếp.');
                }
            } else {
                // ── KHÔNG LIÊN KẾT: chỉ đóng lệnh, ghi nhật ký nếu có thiết bị ──
                if (o.device) {
                    addDeviceLogEntry(o.device, {
                        id: Date.now() + Math.random().toString(36).substr(2,5),
                        performedAt: now, cycleType: 'workorder',
                        cycleLabel: `📋 Lệnh công việc (${o.type || 'Khác'})`,
                        jobText: o.title || '', materials: '', performedBy: o.assignee || '',
                        checkedBy: '', result: 'completed', downtimeMinutes: '',
                        notes: o.completionNotes || '', recordedAt: getCurrentTimestamp()
                    });
                    writeDeviceLogFile(o.device);
                }
                renderWorkOrderPage();
                renderWoDetail(o);
                if (wantsRCA) {
                    const r = createRcaRecord(
                        { item: o.device || '', name: o.deviceName || '', area: '' },
                        `Từ lệnh công việc ${o.id}: ${o.title}${o.completionNotes ? '\n\nGhi chú: ' + o.completionNotes : ''}`,
                        'workorder', o.id + ' — ' + o.title
                    );
                    if (r) { switchMainTab('rca'); setTimeout(() => { renderRcaList(); openRcaEditor(r.id); }, 300); }
                }
                if (wantsAdhoc && o.device) {
                    pushWoFindingToAdhocPlan(
                        o.device, o.deviceName || '',
                        `Phát hiện qua lệnh công việc "${o.title}" (${o.id}): ${o.completionNotes || ''}`.trim(),
                        `Đẩy từ lệnh công việc ${o.id} — ${now}`
                    );
                    alert('⚠️ Đã thêm vào Kế hoạch bảo trì đột xuất để theo dõi tiếp.');
                }
            }
        }

        // Báo cáo ca
        function woPrintShiftReport() {
            const orders = woGetOrders(woCurrentDate);
            const shiftFilter = document.getElementById('woShiftFilter')?.value || 'all';
            const filtered = shiftFilter === 'all' ? orders : orders.filter(o => o.shift === shiftFilter);
            const shiftLabel = shiftFilter === 'all' ? 'Tất cả ca' : WO_SHIFTS[shiftFilter];

            const statusLabel = { pending: 'Chờ thực hiện', inprogress: 'Đang thực hiện', done: 'Đã hoàn thành' };
            const priLabel = { normal: 'Bình thường', urgent: 'Khẩn', critical: 'Cấp cứu' };

            const grouped = { pending: filtered.filter(o=>o.status==='pending'), inprogress: filtered.filter(o=>o.status==='inprogress'), done: filtered.filter(o=>o.status==='done') };
            const rate = filtered.length > 0 ? Math.round(grouped.done.length / filtered.length * 100) : 0;

            const buildRows = (list) => list.map((o,i) => `
                <tr>
                    <td>${i+1}</td>
                    <td><strong>${o.title}</strong>${o.device ? `<br><span style="font-size:11px; color:#666;">⚙️ ${o.device}${o.deviceName?' — '+o.deviceName:''}</span>` : ''}</td>
                    <td>${o.type||'—'}</td>
                    <td>${priLabel[o.priority]||'—'}</td>
                    <td>${WO_SHIFTS[o.shift]||'—'}</td>
                    <td>${o.assignee||'—'}</td>
                    <td>${o.estHours ? o.estHours+'h' : '—'}</td>
                    <td>${o.actualHours ? o.actualHours+'h' : '—'}</td>
                    <td>${statusLabel[o.status]||'—'}</td>
                </tr>
                ${o.completionNotes ? `<tr><td colspan="9" style="font-size:11px; color:#555; padding:2px 6px;">↳ Ghi chú: ${o.completionNotes}</td></tr>` : ''}
            `).join('');

            const bodyHtml = `
                <div style="display:flex; gap:24px; margin-bottom:16px; flex-wrap:wrap;">
                    <div><strong>Ngày:</strong> ${woFmtDayName(woCurrentDate)}</div>
                    <div><strong>Ca:</strong> ${shiftLabel}</div>
                    <div><strong>Tổng lệnh:</strong> ${filtered.length}</div>
                    <div><strong>Hoàn thành:</strong> ${grouped.done.length}/${filtered.length} (${rate}%)</div>
                    <div><strong>Còn tồn:</strong> ${grouped.pending.length + grouped.inprogress.length}</div>
                </div>
                ${filtered.length === 0 ? '<p style="color:#999; text-align:center;">Không có lệnh công việc nào trong ca này.</p>' : `
                <table>
                    <thead><tr><th>#</th><th>Công việc</th><th>Loại</th><th>Ưu tiên</th><th>Ca</th><th>Người PT</th><th>DK</th><th>TT</th><th>Trạng thái</th></tr></thead>
                    <tbody>${buildRows(filtered)}</tbody>
                </table>
                <div style="margin-top:20px; display:flex; gap:40px;">
                    <div class="sig-box"><p><strong>Người lập báo cáo</strong></p><span style="font-size:11px;color:#555;">(Ký & ghi rõ họ tên)</span><br><br><br><br></div>
                    <div class="sig-box"><p><strong>Trưởng ca / Trưởng bộ phận</strong></p><span style="font-size:11px;color:#555;">(Xác nhận)</span><br><br><br><br></div>
                </div>`}
            `;
            openPrintWindow(`BÁO CÁO CÔNG VIỆC CA — ${shiftLabel}`, woFmtDayName(woCurrentDate), bodyHtml);
        }

