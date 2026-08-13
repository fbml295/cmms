        // ================================================================
        // MODULE: KẾ HOẠCH BẢO TRÌ LỚN THEO ĐỢT / NĂM ("MASTER LIST")
        // ================================================================
        // Quản lý các đợt bảo trì lớn (shutdown lớn, đại tu...) trong năm,
        // mỗi đợt gồm nhiều hạng mục công việc lớn. Có thể xuất từng hạng mục
        // thành Lệnh công việc (tab "Việc ngày") để giao cho kỹ thuật viên xử lý —
        // trạng thái hạng mục sẽ tự phản ánh theo trạng thái lệnh công việc liên kết.

        let masterCampaigns = []; // [{id, name, year, startDate, endDate, scope, areas, status, notes, createdAt, updatedAt, items:[{id,title,device,deviceName,area,category,priority,assignee,plannedDays,status,notes,createdAt}]}]
        let currentMasterCampaignId = null;
        let masterplanYearFilter = null; // null = tất cả các năm

        const MP_CATEGORIES = ['Cơ khí', 'Điện', 'Tự động hóa', 'Vệ sinh công nghiệp', 'An toàn', 'Khác'];
        const MP_CAMPAIGN_STATUS = {
            planning:    { label: '📝 Đang lên kế hoạch', cls: 'mp-status-planning' },
            approved:    { label: '✅ Đã duyệt',           cls: 'mp-status-approved' },
            in_progress: { label: '▶️ Đang thực hiện',      cls: 'mp-status-inprogress' },
            done:        { label: '🏁 Đã hoàn thành',       cls: 'mp-status-done' }
        };

        // ---------- LƯU / NẠP ----------
        function saveMasterCampaignsToStorage() {
            localStorage.setItem('masterCampaigns', JSON.stringify(masterCampaigns));
            if (appMode === 'drive' && driveMasterPlanFolderId) driveSyncJsonFile(driveMasterPlanFolderId, 'masterCampaigns.json', masterCampaigns);
        }
        function loadMasterCampaignsFromStorage() {
            try { masterCampaigns = JSON.parse(localStorage.getItem('masterCampaigns') || '[]'); } catch (e) { masterCampaigns = []; }
        }
        function mpGenId(prefix) { return prefix + '_' + Date.now() + Math.random().toString(36).substr(2, 5); }

        // ---------- TIỆN ÍCH ----------
        function mpCampaignDurationDays(c) {
            if (!c.startDate || !c.endDate) return 0;
            const ms = new Date(c.endDate) - new Date(c.startDate);
            return Math.max(1, Math.round(ms / 86400000) + 1);
        }
        function mpFmtDate(d) { return d ? d.split('-').reverse().join('/') : '—'; }

        // Tìm lệnh công việc (Việc ngày) đang liên kết với 1 hạng mục lớn (dùng lại hạ tầng woFindLinkedOrder có sẵn)
        function mpFindItemWorkOrder(itemId, includeDone) {
            for (const d of Object.keys(workOrders)) {
                const found = (workOrders[d] || []).find(o => o.sourceRef && o.sourceRef.kind === 'master' && o.sourceRef.planId === itemId && (includeDone || o.status !== 'done'));
                if (found) return found;
            }
            return null;
        }
        // Trạng thái "thực tế" của 1 hạng mục = suy ra từ lệnh công việc đã giao (nếu có), nếu chưa giao thì dùng trạng thái thủ công
        function mpItemEffectiveStatus(item) {
            const wo = mpFindItemWorkOrder(item.id, true);
            if (wo) return wo.status === 'done' ? 'done' : (wo.status === 'inprogress' ? 'in_progress' : 'assigned');
            return item.status || 'pending';
        }
        const MP_ITEM_STATUS_LABEL = {
            pending: { label: '🕓 Chưa giao việc', cls: 'adhoc-status-unscheduled' },
            assigned: { label: '📋 Đã giao (chờ làm)', cls: 'adhoc-status-scheduled' },
            in_progress: { label: '▶️ Đang thực hiện', cls: 'adhoc-status-in_progress' },
            done: { label: '✅ Hoàn thành', cls: 'adhoc-status-in_progress' }
        };

        function mpComputeProgress(c) {
            const items = c.items || [];
            if (items.length === 0) return { done: 0, total: 0, pct: 0 };
            const done = items.filter(i => mpItemEffectiveStatus(i) === 'done').length;
            return { done, total: items.length, pct: Math.round(done / items.length * 100) };
        }

        function mpAllYears() {
            const ys = new Set(masterCampaigns.map(c => String(c.year || (c.startDate || '').slice(0, 4) || new Date().getFullYear())));
            ys.add(String(new Date().getFullYear()));
            return Array.from(ys).sort((a, b) => b.localeCompare(a));
        }

        // ---------- VIEW: DANH SÁCH CÁC ĐỢT (theo năm) ----------
        function renderMasterPlanPage() {
            const listView = document.getElementById('masterplanListView');
            const detailView = document.getElementById('masterplanDetailView');
            if (detailView) detailView.classList.add('hidden');
            if (listView) listView.classList.remove('hidden');

            if (masterplanYearFilter === null) {
                const years = mpAllYears();
                masterplanYearFilter = years.includes(String(new Date().getFullYear())) ? String(new Date().getFullYear()) : years[0];
            }

            const yearSelectEl = document.getElementById('mpYearSelect');
            if (yearSelectEl) {
                const years = mpAllYears();
                yearSelectEl.innerHTML = years.map(y => `<option value="${y}" ${y === masterplanYearFilter ? 'selected' : ''}>${y}</option>`).join('');
            }

            const container = document.getElementById('masterplanListContainer');
            if (!container) return;

            const list = masterCampaigns
                .filter(c => String(c.year || (c.startDate || '').slice(0, 4)) === masterplanYearFilter)
                .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

            // Tóm tắt năm
            const summaryEl = document.getElementById('mpYearSummary');
            if (summaryEl) {
                const totalDays = list.reduce((s, c) => s + mpCampaignDurationDays(c), 0);
                const totalItems = list.reduce((s, c) => s + (c.items || []).length, 0);
                const doneItems = list.reduce((s, c) => s + mpComputeProgress(c).done, 0);
                summaryEl.innerHTML = `
                    <div class="stat-card c-sky"><div class="stat-icon">🗓️</div><div class="stat-label">Số đợt trong năm ${masterplanYearFilter}</div><div class="stat-value">${list.length}</div></div>
                    <div class="stat-card c-amber"><div class="stat-icon">⏱️</div><div class="stat-label">Tổng ngày dừng máy dự kiến</div><div class="stat-value">${totalDays}</div></div>
                    <div class="stat-card c-emerald"><div class="stat-icon">✅</div><div class="stat-label">Hạng mục đã hoàn thành</div><div class="stat-value">${doneItems}/${totalItems}</div></div>
                `;
            }

            if (list.length === 0) {
                container.innerHTML = `<div class="italic text-center p-20" style="color: var(--text-muted); margin-top: 30px;">Chưa có đợt bảo trì lớn nào trong năm ${masterplanYearFilter}. Bấm "➕ Thêm đợt bảo trì lớn" để bắt đầu.</div>`;
                return;
            }

            container.innerHTML = list.map(c => {
                const prog = mpComputeProgress(c);
                const st = MP_CAMPAIGN_STATUS[c.status] || MP_CAMPAIGN_STATUS.planning;
                const days = mpCampaignDurationDays(c);
                return `
                    <div class="rca-list-card" style="border-left-color:var(--color-violet); cursor:pointer;" onclick="openMasterCampaignDetail('${c.id}')">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span class="rca-status-pill ${st.cls}" style="background:rgba(168,85,247,0.12); color:var(--color-violet); border:1px solid rgba(168,85,247,0.3);">${st.label}</span>
                                <span class="rca-source-pill">📅 ${mpFmtDate(c.startDate)} → ${mpFmtDate(c.endDate)} (${days} ngày)</span>
                            </div>
                            <span style="font-size:0.72rem; color:var(--text-muted);">${prog.total} hạng mục — ${prog.pct}% hoàn thành</span>
                        </div>
                        <div style="margin-top:6px;">
                            <strong style="color:white; font-size:0.9rem;">${rcaEsc(c.name || '(chưa đặt tên đợt)')}</strong>
                            ${c.areas ? `<span style="color:var(--text-muted); font-size:0.78rem;"> — 📍 ${rcaEsc(c.areas)}</span>` : ''}
                        </div>
                        <div class="sbc-track" style="margin-top:8px; height:10px;">
                            <div class="sbc-fill" style="width:${prog.pct}%; background:var(--color-emerald);"></div>
                        </div>
                        ${c.notes ? `<div style="font-size:0.76rem; color:var(--text-muted); margin-top:6px; white-space:pre-wrap;">${rcaEsc((c.notes || '').slice(0, 160))}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        function mpChangeYearFilter(value) {
            masterplanYearFilter = value;
            renderMasterPlanPage();
        }

        // ---------- MODAL: THÊM / SỬA THÔNG TIN ĐỢT ----------
        function openMasterCampaignEditModal(id) {
            const c = id ? masterCampaigns.find(x => x.id === id) : null;
            const isNew = !c;
            const data = c || { name: '', startDate: '', endDate: '', scope: 'full_shutdown', areas: '', status: 'planning', notes: '' };

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'mpCampaignModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 480px;">
                    <div class="modal-header">
                        <span class="modal-title">${isNew ? '➕ Thêm đợt bảo trì lớn' : '✏️ Sửa thông tin đợt'}</span>
                        <button class="close-modal" onclick="document.getElementById('mpCampaignModal').remove()">✖</button>
                    </div>
                    <form onsubmit="saveMasterCampaignFromModal(event, ${isNew ? 'null' : `'${id}'`})">
                        <div class="settings-form-group">
                            <label>Tên đợt bảo trì *</label>
                            <input type="text" id="mp_name" class="search-input" value="${rcaEsc(data.name)}" placeholder="VD: Đại tu tháng 6/2026" required>
                        </div>
                        <div class="config-form-row">
                            <div class="config-form-field">
                                <label>Từ ngày *</label>
                                <input type="date" id="mp_startDate" class="search-input" value="${data.startDate || ''}" required>
                            </div>
                            <div class="config-form-field">
                                <label>Đến ngày *</label>
                                <input type="date" id="mp_endDate" class="search-input" value="${data.endDate || ''}" required>
                            </div>
                        </div>
                        <div class="settings-form-group">
                            <label>Phạm vi</label>
                            <select id="mp_scope" class="search-input">
                                <option value="full_shutdown" ${data.scope === 'full_shutdown' ? 'selected' : ''}>🛑 Dừng máy toàn nhà máy</option>
                                <option value="partial" ${data.scope === 'partial' ? 'selected' : ''}>⚙️ Dừng theo khu vực / dây chuyền con</option>
                            </select>
                        </div>
                        <div class="settings-form-group">
                            <label>Khu vực liên quan (tùy chọn)</label>
                            <input type="text" id="mp_areas" class="search-input" value="${rcaEsc(data.areas)}" placeholder="VD: MDF 2, Khu nghiền">
                        </div>
                        <div class="settings-form-group">
                            <label>Trạng thái đợt</label>
                            <select id="mp_status" class="search-input">
                                ${Object.entries(MP_CAMPAIGN_STATUS).map(([k, v]) => `<option value="${k}" ${data.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
                            </select>
                        </div>
                        <div class="settings-form-group">
                            <label>Ghi chú / mục tiêu đợt</label>
                            <textarea id="mp_notes" class="log-textarea" placeholder="Mục tiêu, phạm vi công việc chung, lưu ý nguồn lực...">${rcaEsc(data.notes)}</textarea>
                        </div>
                        <div class="log-actions">
                            <button type="button" class="btn btn-slate" onclick="document.getElementById('mpCampaignModal').remove()">Hủy</button>
                            <button type="submit" class="btn btn-violet">💾 Lưu</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function saveMasterCampaignFromModal(event, id) {
            event.preventDefault();
            const name = document.getElementById('mp_name').value.trim();
            const startDate = document.getElementById('mp_startDate').value;
            const endDate = document.getElementById('mp_endDate').value;
            if (startDate && endDate && startDate > endDate) {
                alert('Ngày bắt đầu phải trước ngày kết thúc.');
                return;
            }
            const scope = document.getElementById('mp_scope').value;
            const areas = document.getElementById('mp_areas').value.trim();
            const status = document.getElementById('mp_status').value;
            const notes = document.getElementById('mp_notes').value.trim();

            if (id) {
                const c = masterCampaigns.find(x => x.id === id);
                if (c) {
                    Object.assign(c, { name, startDate, endDate, year: startDate.slice(0, 4), scope, areas, status, notes, updatedAt: getCurrentTimestamp() });
                }
            } else {
                masterCampaigns.push({
                    id: mpGenId('mpc'), name, startDate, endDate, year: startDate.slice(0, 4),
                    scope, areas, status, notes, items: [],
                    createdAt: getCurrentTimestamp(), updatedAt: getCurrentTimestamp()
                });
            }
            saveMasterCampaignsToStorage();
            document.getElementById('mpCampaignModal')?.remove();
            masterplanYearFilter = startDate ? startDate.slice(0, 4) : masterplanYearFilter;
            renderMasterPlanPage();
        }

        function deleteMasterCampaign(id) {
            showDeleteConfirm('Xóa toàn bộ đợt bảo trì lớn này (và mọi hạng mục bên trong)? Hành động không thể hoàn tác.', () => {
                masterCampaigns = masterCampaigns.filter(c => c.id !== id);
                saveMasterCampaignsToStorage();
                closeMasterCampaignDetail();
                renderMasterPlanPage();
            });
        }

        // ---------- VIEW: CHI TIẾT 1 ĐỢT ----------
        function openMasterCampaignDetail(id) {
            currentMasterCampaignId = id;
            document.getElementById('masterplanListView')?.classList.add('hidden');
            document.getElementById('masterplanDetailView')?.classList.remove('hidden');
            renderMasterCampaignDetail();
        }
        function closeMasterCampaignDetail() {
            currentMasterCampaignId = null;
            document.getElementById('masterplanDetailView')?.classList.add('hidden');
            document.getElementById('masterplanListView')?.classList.remove('hidden');
            renderMasterPlanPage();
        }

        function renderMasterCampaignDetail() {
            const view = document.getElementById('masterplanDetailView');
            const c = masterCampaigns.find(x => x.id === currentMasterCampaignId);
            if (!view || !c) return;
            const prog = mpComputeProgress(c);
            const st = MP_CAMPAIGN_STATUS[c.status] || MP_CAMPAIGN_STATUS.planning;
            const days = mpCampaignDurationDays(c);

            const itemsRows = (c.items || []).map(item => {
                const effStatus = mpItemEffectiveStatus(item);
                const stLabel = MP_ITEM_STATUS_LABEL[effStatus] || MP_ITEM_STATUS_LABEL.pending;
                const wo = mpFindItemWorkOrder(item.id, true);
                const priorityLvl = item.priority || 0;
                return `
                    <div class="plan-item-card" style="margin-bottom:10px;">
                        <div class="plan-card-split">
                            <div class="plan-panel-left" style="flex-direction:column; align-items:stretch; gap:8px;">
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:space-between;">
                                    <span class="adhoc-status-badge ${stLabel.cls}">${stLabel.label}${wo ? ` (Lệnh ${wo.id})` : ''}</span>
                                    <div class="adhoc-priority-stars lvl-${priorityLvl}" title="Mức ưu tiên">
                                        <span class="star ${priorityLvl >= 1 ? 'active' : ''}" onclick="mpSetItemPriority('${item.id}', 1, event)">★</span>
                                        <span class="star ${priorityLvl >= 2 ? 'active' : ''}" onclick="mpSetItemPriority('${item.id}', 2, event)">★</span>
                                        <span class="star ${priorityLvl >= 3 ? 'active' : ''}" onclick="mpSetItemPriority('${item.id}', 3, event)">★</span>
                                    </div>
                                </div>
                                <input type="text" class="search-input" value="${rcaEsc(item.title)}" placeholder="Tên hạng mục công việc lớn..." style="font-weight:700;" onchange="updateMasterCampaignItemField('${item.id}','title',this.value)">
                                <div class="wo-form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                                    <select class="search-input" onchange="updateMasterCampaignItemField('${item.id}','device',this.value, this)">
                                        ${typeof buildWoDeviceOptions === 'function' ? buildWoDeviceOptions(item.device || '') : `<option value="">— Không gắn thiết bị —</option>`}
                                    </select>
                                    <select class="search-input" onchange="updateMasterCampaignItemField('${item.id}','category',this.value)">
                                        ${MP_CATEGORIES.map(cat => `<option value="${cat}" ${item.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                                    </select>
                                </div>
                                <textarea class="log-textarea" placeholder="Nội dung / phạm vi công việc chi tiết..." style="min-height:40px;" onchange="updateMasterCampaignItemField('${item.id}','notes',this.value)">${rcaEsc(item.notes)}</textarea>
                            </div>
                            <div class="plan-panel-right">
                                <span class="plan-panel-right-label">👤 Người phụ trách</span>
                                <select class="search-input" style="padding:5px 6px; font-size:0.78rem;" onchange="updateMasterCampaignItemField('${item.id}','assignee',this.value)">${typeof personnelOptionsHtml === 'function' ? personnelOptionsHtml(item.assignee) : ''}</select>
                                <span class="plan-panel-right-label" style="margin-top:6px;">⏱ Số ngày dự kiến</span>
                                <input type="number" min="0" step="0.5" class="search-input" style="padding:5px 6px; font-size:0.78rem;" value="${item.plannedDays || ''}" onchange="updateMasterCampaignItemField('${item.id}','plannedDays',this.value)">
                                ${!wo ? `<button type="button" class="btn btn-sky" style="margin-top:8px; padding:5px 8px; font-size:0.72rem;" onclick="mpCreateWorkOrderForItem('${item.id}')">📋 Giao việc (tạo lệnh CV)</button>`
                                      : `<button type="button" class="btn btn-slate" style="margin-top:8px; padding:5px 8px; font-size:0.72rem;" onclick="switchMainTab('workorder')">🔗 Xem lệnh ${wo.id}</button>`}
                            </div>
                        </div>
                        <button onclick="removeMasterCampaignItem('${item.id}')" class="btn-remove-plan" title="Xóa hạng mục">✖</button>
                    </div>
                `;
            }).join('');

            view.innerHTML = `
                <div class="rca-editor-header">
                    <button class="rca-back-btn" onclick="closeMasterCampaignDetail()">← Quay lại danh sách đợt</button>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <button type="button" class="btn btn-slate" style="padding:5px 10px; font-size:0.72rem;" onclick="openMasterCampaignEditModal('${c.id}')">✏️ Sửa thông tin đợt</button>
                        <button type="button" class="btn btn-sky" style="padding:5px 10px; font-size:0.72rem;" onclick="mpBulkCreateWorkOrders('${c.id}')">📤 Xuất tất cả → Lệnh CV</button>
                        <button type="button" class="btn btn-slate" style="padding:5px 10px; font-size:0.72rem;" onclick="printMasterCampaign('${c.id}')">📠 In kế hoạch đợt</button>
                        <button type="button" class="btn btn-slate" style="padding:5px 10px; font-size:0.72rem; background:rgba(239,68,68,0.12); color:var(--color-rose); border:1px solid rgba(239,68,68,0.3);" onclick="deleteMasterCampaign('${c.id}')">🗑️ Xóa đợt</button>
                    </div>
                </div>

                <div class="rca-section">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
                        <strong style="font-size:1rem; color:white;">${rcaEsc(c.name)}</strong>
                        <span class="rca-status-pill" style="background:rgba(168,85,247,0.12); color:var(--color-violet); border:1px solid rgba(168,85,247,0.3);">${st.label}</span>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:10px;">
                        📅 ${mpFmtDate(c.startDate)} → ${mpFmtDate(c.endDate)} (${days} ngày) &nbsp;•&nbsp;
                        ${c.scope === 'full_shutdown' ? '🛑 Dừng máy toàn nhà máy' : '⚙️ Dừng theo khu vực'}
                        ${c.areas ? ` &nbsp;•&nbsp; 📍 ${rcaEsc(c.areas)}` : ''}
                    </div>
                    ${c.notes ? `<div style="font-size:0.8rem; color:#cbd5e1; white-space:pre-wrap; margin-bottom:10px;">${rcaEsc(c.notes)}</div>` : ''}
                    <div class="sbc-track" style="height:12px;">
                        <div class="sbc-fill" style="width:${prog.pct}%; background:var(--color-emerald);"></div>
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${prog.done}/${prog.total} hạng mục hoàn thành (${prog.pct}%)</div>
                </div>

                <div class="rca-section">
                    <div class="rca-section-title" style="justify-content:space-between;">
                        <span><span class="badge-num">📋</span> Các hạng mục công việc lớn (${(c.items || []).length})</span>
                        <button type="button" class="rca-add-row-btn" style="margin-top:0;" onclick="addMasterCampaignItem()">➕ Thêm hạng mục</button>
                    </div>
                    ${itemsRows || `<div class="italic text-center" style="color:var(--text-muted); padding:20px 0;">Chưa có hạng mục nào. Bấm "➕ Thêm hạng mục" để bắt đầu liệt kê công việc cho đợt này.</div>`}
                </div>
            `;
        }

        function addMasterCampaignItem() {
            const c = masterCampaigns.find(x => x.id === currentMasterCampaignId);
            if (!c) return;
            if (!c.items) c.items = [];
            c.items.push({
                id: mpGenId('mpi'), title: '', device: '', deviceName: '', area: '',
                category: MP_CATEGORIES[0], priority: 0, assignee: '', plannedDays: '',
                status: 'pending', notes: '', createdAt: getCurrentTimestamp()
            });
            saveMasterCampaignsToStorage();
            renderMasterCampaignDetail();
        }

        function updateMasterCampaignItemField(itemId, field, value, selectEl) {
            const c = masterCampaigns.find(x => x.id === currentMasterCampaignId);
            if (!c) return;
            const item = (c.items || []).find(i => i.id === itemId);
            if (!item) return;
            item[field] = value;
            if (field === 'device' && selectEl) {
                const opt = selectEl.options[selectEl.selectedIndex];
                item.deviceName = opt ? (opt.getAttribute('data-name') || '') : '';
            }
            saveMasterCampaignsToStorage();
        }

        function mpSetItemPriority(itemId, level, event) {
            if (event) event.stopPropagation();
            const c = masterCampaigns.find(x => x.id === currentMasterCampaignId);
            if (!c) return;
            const item = (c.items || []).find(i => i.id === itemId);
            if (!item) return;
            item.priority = (item.priority === level) ? 0 : level;
            saveMasterCampaignsToStorage();
            renderMasterCampaignDetail();
        }

        function removeMasterCampaignItem(itemId) {
            showDeleteConfirm('Xóa hạng mục này khỏi đợt bảo trì?', () => {
                const c = masterCampaigns.find(x => x.id === currentMasterCampaignId);
                if (!c) return;
                c.items = (c.items || []).filter(i => i.id !== itemId);
                saveMasterCampaignsToStorage();
                renderMasterCampaignDetail();
            });
        }

        // ---------- GIAO VIỆC: TẠO LỆNH CÔNG VIỆC TỪ 1 HOẶC TOÀN BỘ HẠNG MỤC ----------
        function mpCreateWorkOrderForItem(itemId) {
            const c = masterCampaigns.find(x => x.id === currentMasterCampaignId);
            if (!c) return;
            const item = (c.items || []).find(i => i.id === itemId);
            if (!item) return;
            const priority = item.priority >= 3 ? 'critical' : (item.priority >= 2 ? 'urgent' : 'normal');
            openCreateWorkOrder({
                title: `[${c.name}] ${item.title || '(chưa đặt tên)'}`,
                type: item.category || 'Bảo trì định kỳ',
                priority,
                date: c.startDate || woTodayStr(),
                assignee: item.assignee || '',
                device: item.device || '',
                description: item.notes || '',
                sourceRef: { kind: 'master', planId: item.id, campaignId: c.id }
            });
        }

        function mpBulkCreateWorkOrders(campaignId) {
            const c = masterCampaigns.find(x => x.id === campaignId);
            if (!c || !c.items || c.items.length === 0) { alert('Đợt này chưa có hạng mục nào để xuất.'); return; }
            if (!confirm(`Tạo lệnh công việc cho toàn bộ ${c.items.length} hạng mục trong đợt "${c.name}"?\n(Hạng mục nào đã có lệnh công việc từ trước sẽ được bỏ qua, không tạo trùng.)`)) return;
            let created = 0, skipped = 0;
            c.items.forEach(item => {
                if (mpFindItemWorkOrder(item.id, true)) { skipped++; return; }
                const priority = item.priority >= 3 ? 'critical' : (item.priority >= 2 ? 'urgent' : 'normal');
                createWorkOrderSilent({
                    title: `[${c.name}] ${item.title || '(chưa đặt tên)'}`,
                    type: item.category || 'Bảo trì định kỳ',
                    priority,
                    date: c.startDate || woTodayStr(),
                    assignee: item.assignee || '',
                    device: item.device || '',
                    description: item.notes || '',
                    sourceRef: { kind: 'master', planId: item.id, campaignId: c.id }
                });
                created++;
            });
            saveWorkOrdersToStorage();
            if (typeof renderWorkOrderPage === 'function' && currentMainTab === 'workorder') renderWorkOrderPage();
            renderMasterCampaignDetail();
            alert(`Đã tạo ${created} lệnh công việc mới${skipped > 0 ? `, bỏ qua ${skipped} hạng mục đã có lệnh công việc từ trước` : ''}.\nVào tab "🗂️ Việc ngày" để giao và theo dõi xử lý.`);
        }

        // ---------- IN KẾ HOẠCH ĐỢT (TRÌNH DUYỆT / PHÊ DUYỆT) ----------
        function printMasterCampaign(id) {
            const c = masterCampaigns.find(x => x.id === id);
            if (!c) return;
            const days = mpCampaignDurationDays(c);
            const rows = (c.items || []).map((item, idx) => {
                const stLabel = MP_ITEM_STATUS_LABEL[mpItemEffectiveStatus(item)] || MP_ITEM_STATUS_LABEL.pending;
                return `
                    <tr>
                        <td style="text-align:center;">${idx + 1}</td>
                        <td>${rcaEsc(item.title) || '—'}</td>
                        <td style="text-align:center;">${rcaEsc(item.device) || '—'}</td>
                        <td style="text-align:center;">${rcaEsc(item.category) || '—'}</td>
                        <td style="white-space:pre-wrap;">${rcaEsc(item.notes) || '—'}</td>
                        <td style="text-align:center;">${item.plannedDays || '—'}</td>
                        <td style="text-align:center;">${rcaEsc(item.assignee) || '—'}</td>
                        <td style="text-align:center;">${stLabel.label}</td>
                    </tr>
                `;
            }).join('');
            const bodyHtml = `
                <p style="font-size:13px; margin-bottom:14px;">
                    <strong>Thời gian:</strong> ${mpFmtDate(c.startDate)} → ${mpFmtDate(c.endDate)} (${days} ngày) &nbsp;|&nbsp;
                    <strong>Phạm vi:</strong> ${c.scope === 'full_shutdown' ? 'Dừng máy toàn nhà máy' : 'Dừng theo khu vực'}
                    ${c.areas ? ` (${rcaEsc(c.areas)})` : ''} &nbsp;|&nbsp;
                    <strong>Tổng hạng mục:</strong> ${(c.items || []).length}
                </p>
                ${c.notes ? `<p style="font-size:12px; margin-bottom:14px; white-space:pre-wrap;"><strong>Mục tiêu / ghi chú:</strong> ${rcaEsc(c.notes)}</p>` : ''}
                <table>
                    <thead><tr><th style="width:4%;">STT</th><th style="width:22%;">Hạng mục công việc</th><th style="width:10%;">Thiết bị</th><th style="width:10%;">Nhóm</th><th style="width:24%;">Nội dung chi tiết</th><th style="width:8%;">Số ngày</th><th style="width:12%;">Người phụ trách</th><th style="width:10%;">Trạng thái</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="8" style="text-align:center;">Chưa có hạng mục nào</td></tr>'}</tbody>
                </table>
                <div class="footer-sig">
                    <div class="sig-box"><p><strong>Người lập kế hoạch</strong></p><span style="font-size:11px; color:#555;">(Ký & ghi rõ họ tên)</span><br><br><br><br><br><p>.......................................</p></div>
                    <div class="sig-box"><p><strong>Trưởng phòng KTCL</strong></p><span style="font-size:11px; color:#555;">(Xem xét)</span><br><br><br><br><br><p>.......................................</p></div>
                    <div class="sig-box"><p><strong>Ban Giám đốc</strong></p><span style="font-size:11px; color:#555;">(Phê duyệt)</span><br><br><br><br><br><p>.......................................</p></div>
                </div>
            `;
            const lineInfo = getCompanyInfo().lineName;
            openPrintWindow('KẾ HOẠCH BẢO TRÌ LỚN — ' + (c.name || ''), lineInfo || '', bodyHtml);
        }
        // ================================================================
