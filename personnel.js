        // ============================================================
        // MODULE NHÂN SỰ (Mục 15, 16, 18, 19)
        // ============================================================
        function savePersonnelToStorage() {
            localStorage.setItem('personnelList', JSON.stringify(personnelList));
        }

        function loadPersonnelFromStorage() {
            const stored = localStorage.getItem('personnelList');
            if (stored) {
                try { personnelList = JSON.parse(stored); } catch (e) { console.error("Lỗi khôi phục danh sách nhân sự:", e); }
            }
        }

        // Sinh danh sách <option> cho select chọn Người thực hiện. selectedName sẽ được đánh dấu chọn sẵn.
        function personnelOptionsHtml(selectedName) {
            let html = `<option value="">— Chọn người thực hiện —</option>`;
            personnelList.forEach(p => {
                const label = p.position ? `${p.name} (${p.position})` : p.name;
                html += `<option value="${p.name.replace(/"/g, '&quot;')}" ${selectedName === p.name ? 'selected' : ''}>${label.replace(/</g,'&lt;')}</option>`;
            });
            if (personnelList.length === 0) {
                html += `<option value="" disabled>(Chưa có nhân sự - vào "📁 Quản lý dữ liệu" > "👥 Quản lý Nhân sự" để thêm)</option>`;
            }
            return html;
        }

        // Cập nhật người được giao việc cho 1 hạng mục trong kế hoạch bảo trì theo chu kỳ
        function updatePlanAssignedTo(planId, value) {
            const planItem = maintPlan.find(p => p.planId === planId);
            if (!planItem) return;
            planItem.assignedTo = value;
            savePlanToLocalStorage();
        }

        // Cập nhật người được giao việc cho 1 hạng mục trong kế hoạch bảo trì đột xuất
        function updateAdhocAssignedTo(planId, value) {
            const planItem = adhocPlan.find(p => p.planId === planId);
            if (!planItem) return;
            planItem.assignedTo = value;
            saveAdhocPlanToLocalStorage();
        }

        function csvEscapePersonnel(v) {
            v = String(v == null ? '' : v);
            if (v.includes(',') || v.includes('"') || v.includes('\n')) {
                return '"' + v.replace(/"/g, '""') + '"';
            }
            return v;
        }

        function buildPersonnelCsvString() {
            let csv = '\uFEFF' + ['Họ và tên', 'Chức vụ', 'Bộ phận'].map(csvEscapePersonnel).join(',') + '\r\n';
            personnelList.forEach(p => {
                csv += [p.name, p.position, p.department].map(csvEscapePersonnel).join(',') + '\r\n';
            });
            return csv;
        }

        function exportPersonnelCsv() {
            const blob = new Blob([buildPersonnelCsvString()], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'nhan_su.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function parsePersonnelCsvLine(line) {
            const result = [];
            let cur = '', inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const c = line[i];
                if (inQuotes) {
                    if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                    else if (c === '"') { inQuotes = false; }
                    else { cur += c; }
                } else {
                    if (c === '"') inQuotes = true;
                    else if (c === ',') { result.push(cur); cur = ''; }
                    else cur += c;
                }
            }
            result.push(cur);
            return result;
        }

        async function savePersonnelListNow(btn) {
            savePersonnelToStorage();

            if (appMode === 'drive' && driveTechnicianFolderId) {
                try {
                    const existing = await driveFindFileByName(driveTechnicianFolderId, 'nhan_su.csv');
                    await driveUploadFile(driveTechnicianFolderId, 'nhan_su.csv', buildPersonnelCsvString(), 'text/csv', existing ? existing.id : null);
                    if (btn) {
                        const old = btn.textContent;
                        btn.textContent = '✅ Đã lưu lên Drive!';
                        setTimeout(() => { btn.textContent = old; }, 1500);
                    }
                } catch (err) {
                    alert("Đã lưu trong trình duyệt, nhưng không ghi được lên Google Drive: " + err.message);
                }
                return;
            }

            // Nếu chưa có thư mục "technician" (chưa từng kết nối thư mục dự án),
            // yêu cầu chọn 1 lần — hệ thống sẽ tự tạo/kết nối file nhân sự bên trong.
            if (!technicianDirHandle) {
                await chooseTechnicianDirectory();
            }
            if (technicianDirHandle) {
                // writePersonnelCsvFile tự tạo file nếu chưa có, hoặc ghi đè nếu đã có sẵn.
                const ok = await writePersonnelCsvFile();
                if (ok) {
                    if (btn) {
                        const old = btn.textContent;
                        btn.textContent = '✅ Đã lưu vào file!';
                        setTimeout(() => { btn.textContent = old; }, 1500);
                    }
                } else {
                    alert("Đã lưu trong trình duyệt, nhưng không ghi được vào file nhân sự (có thể chưa cấp quyền ghi). Vui lòng thử lại.");
                }
            } else {
                alert("Đã lưu danh sách trong trình duyệt.\nChưa chọn được thư mục lưu file nhân sự.");
            }
        }

        function addPersonnelRow(event) {
            if (event) event.preventDefault();
            addPersonnelFromPage();
        }

        function removePersonnelRow(id) {
            removePersonnelRowPage(id);
        }

        function updatePersonnelField(id, field, value) {
            const p = personnelList.find(x => x.id === id);
            if (!p) return;
            p[field] = value;
            savePersonnelToStorage();
        }

        function openPersonnelManageModal() {
            switchMainTab('personnel');
        }

        function renderPersonnelManageModal() {
            // Giờ dùng trang Nhân sự thay cho modal — giữ hàm này để tương thích
            renderPersonnelPage();
        }

        // --- Thống kê & Nhật ký theo Nhân sự (Mục 18) ---
        // Lấy toàn bộ log của 1 người trên tất cả thiết bị
        function getPersonnelLogEntries(name) {
            const entries = [];
            Object.keys(deviceLogs).forEach(itemCode => {
                (deviceLogs[itemCode] || []).forEach(e => {
                    if (e.performedBy === name) {
                        entries.push(Object.assign({ itemCode }, e));
                    }
                });
            });
            entries.sort((a, b) => String(b.performedAt).localeCompare(String(a.performedAt)));
            return entries;
        }

        function computePersonnelStats() {
            return personnelList.map(p => {
                const history = getPersonnelLogEntries(p.name);
                const adhocCompleted = history.filter(e => e.cycleType === 'adhoc').length;
                const adhocPending = adhocPlan.filter(a => a.assignedTo === p.name).length;
                return {
                    person: p,
                    totalPerformed: history.length,
                    adhocAssignedTotal: adhocCompleted + adhocPending,
                    adhocCompleted: adhocCompleted,
                    adhocPending: adhocPending,
                    history: history
                };
            });
        }

        function buildPersonnelLogCsv(name) {
            const entries = getPersonnelLogEntries(name);
            let csv = '\uFEFF' + ['Mã thiết bị', 'Ngày giờ thực hiện', 'Loại', 'Nội dung công việc', 'Kết quả', 'Ghi chú'].map(csvEscapePersonnel).join(',') + '\r\n';
            entries.forEach(e => {
                csv += [e.itemCode, e.performedAt, shortCycleLabel(e), e.jobText, e.result, e.notes].map(csvEscapePersonnel).join(',') + '\r\n';
            });
            return csv;
        }

        function downloadPersonnelLogCsv(name) {
            const csv = buildPersonnelLogCsv(name);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nhatky_${name.replace(/[^\p{L}\p{N}]+/gu, '_')}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function openPersonnelLogModal(name) {
            const entries = getPersonnelLogEntries(name);
            const resultLabel = { pass: '✅ Đạt', note: '⚠️ Có lưu ý', fail: '❌ Không đạt' };
            let rows = '';
            if (entries.length === 0) {
                rows = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:14px; font-style:italic;">Chưa có nhật ký bảo trì nào được ghi nhận cho nhân sự này.</td></tr>`;
            } else {
                entries.forEach(e => {
                    rows += `
                        <tr>
                            <td style="padding:5px 6px;">${e.performedAt || ''}</td>
                            <td style="padding:5px 6px;">${e.itemCode || ''}</td>
                            <td style="padding:5px 6px;">${shortCycleLabel(e)}</td>
                            <td style="padding:5px 6px; white-space:pre-wrap;">${(e.jobText || '').replace(/</g,'&lt;')}</td>
                            <td style="padding:5px 6px;">${resultLabel[e.result] || e.result || ''}</td>
                        </tr>`;
                });
            }

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'personnelLogModal';
            modal.innerHTML = `<div class="modal-content" style="width: 720px; max-height: 88vh; overflow-y: auto;">
                <div class="modal-header">
                    <span class="modal-title">📜 Nhật ký công việc — ${name.replace(/</g,'&lt;')}</span>
                    <button class="close-modal" onclick="document.getElementById('personnelLogModal').remove()">✖</button>
                </div>
                <div style="margin-bottom:10px; text-align:right;">
                    <button class="btn btn-sky" style="padding:5px 10px; font-size:0.78rem;" onclick="downloadPersonnelLogCsv('${name.replace(/'/g,"\\'")}')">⬇️ Xuất file CSV nhật ký</button>
                </div>
                <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                    <thead>
                        <tr style="color:var(--text-muted); text-align:left; border-bottom:1px solid var(--border-color);">
                            <th style="padding:5px 6px;">Ngày giờ</th>
                            <th style="padding:5px 6px;">Thiết bị</th>
                            <th style="padding:5px 6px;">Loại</th>
                            <th style="padding:5px 6px;">Nội dung</th>
                            <th style="padding:5px 6px;">Kết quả</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
            document.body.appendChild(modal);
        }

        // ===== TRANG NHÂN SỰ =====
        function renderPersonnelPage() {
            renderPersonnelSummaryStats();
            renderPersonnelTable();
            renderPersonnelStatsBody();
            // sync trạng thái thư mục
            updatePersonnelDirStatusUI(!!technicianDirHandle, technicianDirHandle ? technicianDirHandle.name : '', false);
        }

        function renderPersonnelSummaryStats() {
            const el = document.getElementById('personnelSummaryStats');
            if (!el) return;
            const total = personnelList.length;
            const totalPerformed = computePersonnelStats().reduce((s, p) => s + p.totalPerformed, 0);
            const totalPending = adhocPlan.filter(a => a.assignedTo && a.assignedTo.trim()).length;
            const depts = [...new Set(personnelList.map(p => p.department).filter(Boolean))].length;
            el.innerHTML = `
                <div class="stat-card c-sky">
                    <div class="stat-icon">👷</div>
                    <div class="stat-label">Tổng nhân sự</div>
                    <div class="stat-value">${total}</div>
                    <div class="stat-sub">${depts > 0 ? depts + ' bộ phận' : 'Chưa phân bộ phận'}</div>
                </div>
                <div class="stat-card c-emerald">
                    <div class="stat-icon">✅</div>
                    <div class="stat-label">Lượt bảo trì đã thực hiện</div>
                    <div class="stat-value">${totalPerformed}</div>
                    <div class="stat-sub">Tổng trên toàn bộ nhân sự</div>
                </div>
                <div class="stat-card c-amber">
                    <div class="stat-icon">📋</div>
                    <div class="stat-label">Công việc đột xuất đang giao</div>
                    <div class="stat-value">${totalPending}</div>
                    <div class="stat-sub">Việc đã giao cho nhân sự</div>
                </div>
            `;
        }

        function renderPersonnelTable() {
            const wrapper = document.getElementById('personnelTableWrapper');
            if (!wrapper) return;
            if (personnelList.length === 0) {
                wrapper.innerHTML = `<div style="color:var(--text-muted); font-style:italic; font-size:0.82rem; padding:12px 0; text-align:center;">Chưa có nhân sự nào. Thêm mới ở form bên dưới.</div>`;
                return;
            }
            let rows = '';
            personnelList.forEach((p, idx) => {
                rows += `<tr>
                    <td style="padding:7px 10px; color:var(--text-muted); font-size:0.75rem; width:36px; text-align:center;">${idx + 1}</td>
                    <td style="padding:5px 6px; min-width:140px;"><input class="inline-input personnel-table" type="text" value="${(p.name||'').replace(/"/g,'&quot;')}" placeholder="Họ và tên" onchange="updatePersonnelField('${p.id}','name',this.value); renderPersonnelPage();"></td>
                    <td style="padding:5px 6px; min-width:120px;"><input class="inline-input personnel-table" type="text" value="${(p.position||'').replace(/"/g,'&quot;')}" placeholder="Chức vụ" onchange="updatePersonnelField('${p.id}','position',this.value)"></td>
                    <td style="padding:5px 6px; min-width:120px;"><input class="inline-input personnel-table" type="text" value="${(p.department||'').replace(/"/g,'&quot;')}" placeholder="Bộ phận" onchange="updatePersonnelField('${p.id}','department',this.value)"></td>
                    <td style="padding:5px 10px; text-align:center; width:110px;">
                        <button class="btn btn-slate" style="padding:3px 8px; font-size:0.72rem;" onclick="openPersonnelLogModal('${p.name.replace(/'/g,"\\'")}')">📜</button>
                        <button class="btn btn-violet" style="padding:3px 8px; font-size:0.72rem; margin-left:4px;" onclick="exportPersonnelQrCode('${p.name.replace(/'/g,"\\'")}')" title="Mã QR việc riêng của người này">📱</button>
                        <button class="btn btn-rose" style="padding:3px 7px; font-size:0.72rem; margin-left:4px;" onclick="removePersonnelRowPage('${p.id}')">✖</button>
                    </td>
                </tr>`;
            });
            wrapper.innerHTML = `<table class="personnel-table">
                <thead>
                    <tr>
                        <th style="width:36px;">#</th>
                        <th>Họ và tên</th>
                        <th>Chức vụ</th>
                        <th>Bộ phận</th>
                        <th style="width:110px;"></th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
        }

        function renderPersonnelStatsBody() {
            const el = document.getElementById('personnelStatsBody');
            if (!el) return;
            const stats = computePersonnelStats();
            if (stats.length === 0) {
                el.innerHTML = `<div style="color:var(--text-muted); font-style:italic; font-size:0.82rem; padding:12px 0; text-align:center;">Chưa có dữ liệu thống kê.</div>`;
                return;
            }
            let rows = '';
            stats.forEach(s => {
                const rate = s.adhocAssignedTotal > 0 ? Math.round(s.adhocCompleted / s.adhocAssignedTotal * 100) : null;
                rows += `<tr>
                    <td style="padding:9px 10px;">
                        <div style="font-weight:700; color:var(--text-main); font-size:0.83rem;">${s.person.name}</div>
                        <div style="font-size:0.7rem; color:var(--text-muted);">${s.person.position||''}${s.person.department ? ' · '+s.person.department : ''}</div>
                    </td>
                    <td style="padding:9px 10px; text-align:center;">
                        <span style="font-size:1.1rem; font-weight:800; color:var(--color-sky);">${s.totalPerformed}</span>
                    </td>
                    <td style="padding:9px 10px; text-align:center;">${s.adhocAssignedTotal}</td>
                    <td style="padding:9px 10px; text-align:center; color:var(--color-emerald);">${s.adhocCompleted}</td>
                    <td style="padding:9px 10px; text-align:center; color:var(--color-amber);">${s.adhocPending}</td>
                    <td style="padding:9px 10px; text-align:center;">
                        ${rate !== null ? `<span style="font-size:0.85rem; font-weight:700; color:${rate>=80?'var(--color-emerald)':rate>=50?'var(--color-amber)':'var(--color-rose)'};">${rate}%</span>` : '<span style="color:var(--text-muted); font-size:0.75rem;">—</span>'}
                    </td>
                    <td style="padding:9px 10px; text-align:center;">
                        <button class="btn btn-slate" style="padding:4px 10px; font-size:0.73rem;" onclick="openPersonnelLogModal('${s.person.name.replace(/'/g,"\\'")}')">📜 Nhật ký</button>
                    </td>
                </tr>`;
            });
            el.innerHTML = `<table class="personnel-table">
                <thead>
                    <tr>
                        <th>Nhân sự</th>
                        <th style="text-align:center;">Đã thực hiện</th>
                        <th style="text-align:center;">ĐX: Đã giao</th>
                        <th style="text-align:center;">ĐX: Hoàn thành</th>
                        <th style="text-align:center;">ĐX: Chưa xong</th>
                        <th style="text-align:center;">Tỷ lệ HT</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
        }

        function addPersonnelFromPage() {
            const name = document.getElementById('newPersonName').value.trim();
            const position = document.getElementById('newPersonPosition').value.trim();
            const department = document.getElementById('newPersonDept').value.trim();
            if (!name) { alert('Vui lòng nhập Họ và tên.'); return; }
            personnelList.push({ id: Date.now() + Math.random().toString(36).substr(2,5), name, position, department });
            savePersonnelToStorage();
            document.getElementById('newPersonName').value = '';
            document.getElementById('newPersonPosition').value = '';
            document.getElementById('newPersonDept').value = '';
            renderPersonnelPage();
            renderDashboard();
        }

        function removePersonnelRowPage(id) {
            if (!confirm('Xóa nhân sự này?')) return;
            personnelList = personnelList.filter(p => p.id !== id);
            savePersonnelToStorage();
            renderPersonnelPage();
            renderDashboard();
        }

        async function personnelPageSave(btn) {
            await savePersonnelListNow(btn);
            renderPersonnelPage();
        }

