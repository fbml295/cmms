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
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'personnelManageModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 860px; max-width: 95vw; max-height: 88vh; overflow-y: auto;">
                    <div class="modal-header">
                        <span class="modal-title">📋 Danh sách nhân sự</span>
                        <button class="close-modal" onclick="closePersonnelManageModal()">✖</button>
                    </div>
                    <div style="display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start;">
                        <div style="flex: 0 0 220px; min-width:200px;">
                            <div style="font-size:0.78rem; font-weight:600; color:var(--text-muted); margin-bottom:10px;">➕ Thêm nhân sự mới</div>
                            <div class="form-group">
                                <label>Họ và tên *</label>
                                <input type="text" id="newPersonName" class="search-input" placeholder="Nguyễn Văn A">
                            </div>
                            <div class="form-group">
                                <label>Chức vụ</label>
                                <input type="text" id="newPersonPosition" class="search-input" placeholder="Kỹ thuật viên">
                            </div>
                            <div class="form-group">
                                <label>Bộ phận</label>
                                <input type="text" id="newPersonDept" class="search-input" placeholder="Điện - Cơ khí">
                            </div>
                            <button class="btn btn-emerald" style="width:100%; padding:9px; margin-top:4px;" onclick="addPersonnelFromPage()">+ Thêm</button>
                        </div>
                        <div style="flex: 1; min-width: 320px;">
                            <div style="font-size:0.78rem; font-weight:600; color:var(--text-muted); margin-bottom:10px;">Danh sách hiện tại</div>
                            <div id="personnelTableWrapper"></div>
                        </div>
                    </div>
                    <div style="margin-top:16px; text-align:right; border-top:1px solid var(--border-color); padding-top:14px;">
                        <button class="btn btn-emerald" onclick="personnelPageSave(this)">💾 Lưu danh sách</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            renderPersonnelTable();
        }

        function closePersonnelManageModal() {
            document.getElementById('personnelManageModal')?.remove();
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
                        <button class="btn btn-violet" style="padding:4px 8px; font-size:0.73rem; margin-left:4px;" onclick="exportPersonnelQrCode('${s.person.name.replace(/'/g,"\\'")}')" title="Mã QR việc riêng của người này">📱</button>
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
            showDeleteConfirm('Xóa nhân sự này?', () => {
                personnelList = personnelList.filter(p => p.id !== id);
                savePersonnelToStorage();
                renderPersonnelPage();
                renderDashboard();
            });
        }

        async function personnelPageSave(btn) {
            await savePersonnelListNow(btn);
            renderPersonnelPage();
        }


        // ---- Bổ sung: quản lý thư mục nhân sự offline + QR cá nhân ----
        async function saveTechnicianDirHandleToDB(handle) {
            try {
                const db = await openDB();
                const tx = db.transaction(storeName, "readwrite");
                const store = tx.objectStore(storeName);
                await store.put({ id: "technician_dir", handle: handle, name: handle.name });
            } catch (e) { /* Handle ảo (Google Drive) không thể lưu vào IndexedDB — bỏ qua an toàn */ }
        }

        async function getTechnicianDirHandleFromDB() {
            const db = await openDB();
            return new Promise((resolve) => {
                const tx = db.transaction(storeName, "readonly");
                const store = tx.objectStore(storeName);
                const request = store.get("technician_dir");
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            });
        }

        // Tự động tìm/tạo thư mục "technician" bên trong thư mục dữ liệu vừa chọn, rồi nạp file nhan_su.csv (nếu có)
        async function setupTechnicianFolder(dirHandle) {
            try {
                const techDir = await dirHandle.getDirectoryHandle('technician', { create: true });
                technicianDirHandle = techDir;
                await saveTechnicianDirHandleToDB(techDir);
                await loadPersonnelCsvFromFile();
                updatePersonnelDirStatusUI(true, `technician (trong "${dirHandle.name}")`);
            } catch (err) {
                console.error("Lỗi thiết lập thư mục nhân sự tự động:", err);
            }
        }

        async function tryRestoreTechnicianDirHandle() {
            const saved = await getTechnicianDirHandleFromDB();
            if (!saved || !saved.handle) return;
            try {
                const options = { mode: 'readwrite' };
                let granted = await saved.handle.queryPermission(options);
                if (granted !== 'granted') {
                    technicianDirHandle = saved.handle;
                    updatePersonnelDirStatusUI(true, saved.handle.name, true);
                    return;
                }
                technicianDirHandle = saved.handle;
                await loadPersonnelCsvFromFile();
                updatePersonnelDirStatusUI(true, saved.handle.name);
            } catch (e) {
                console.error("Lỗi khôi phục thư mục nhân sự:", e);
            }
        }

        function updatePersonnelDirStatusUI(connected, name, needsReauth) {
            const html = !connected
                ? `Chưa kết nối thư mục "technician". Danh sách nhân sự đang chỉ lưu trong trình duyệt.`
                : `🗂️ Đã kết nối: <strong>${name}</strong> — file <strong>nhan_su.csv</strong>${needsReauth ? ' (cần xác nhận lại quyền ghi ở lần lưu tiếp theo)' : ''}`;
            document.querySelectorAll('.personnelDirStatusEl').forEach(el => { el.innerHTML = html; });
        }

        // Đọc file nhan_su.csv có sẵn trong thư mục technician (nếu có) và nạp vào personnelList
        async function loadPersonnelCsvFromFile() {
            if (!technicianDirHandle) return;
            try {
                const options = { mode: 'readwrite' };
                if (await technicianDirHandle.queryPermission(options) !== 'granted') {
                    if (await technicianDirHandle.requestPermission(options) !== 'granted') return;
                }
                let fileHandle;
                try {
                    fileHandle = await technicianDirHandle.getFileHandle('nhan_su.csv', { create: false });
                } catch (e) {
                    // Chưa có file -> tạo mới từ danh sách hiện tại (nếu có)
                    await writePersonnelCsvFile();
                    return;
                }
                const file = await fileHandle.getFile();
                const text = (await file.text()).replace(/^\uFEFF/, '');
                const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
                const imported = [];
                lines.forEach((line, idx) => {
                    const cols = parsePersonnelCsvLine(line);
                    const name = (cols[0] || '').trim();
                    if (idx === 0 && (name.toLowerCase().includes('họ') || name.toLowerCase().includes('ho va ten'))) return;
                    if (!name) return;
                    imported.push({
                        id: Date.now() + Math.random().toString(36).substr(2, 5),
                        name: name,
                        position: (cols[1] || '').trim(),
                        department: (cols[2] || '').trim()
                    });
                });
                if (imported.length > 0) {
                    personnelList = imported;
                    savePersonnelToStorage();
                    renderPersonnelPage();
                    renderDashboard();
                }
            } catch (err) {
                console.error("Lỗi nạp file nhân sự:", err);
            }
        }

        // Ghi đè file nhan_su.csv trong thư mục technician với danh sách nhân sự hiện tại
        async function writePersonnelCsvFile() {
            if (!technicianDirHandle) return false;
            try {
                const options = { mode: 'readwrite' };
                if (await technicianDirHandle.queryPermission(options) !== 'granted') {
                    if (await technicianDirHandle.requestPermission(options) !== 'granted') return false;
                }
                const fileHandle = await technicianDirHandle.getFileHandle('nhan_su.csv', { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(buildPersonnelCsvString());
                await writable.close();
                return true;
            } catch (err) {
                console.error("Lỗi ghi file nhân sự:", err);
                return false;
            }
        }

        // Cho phép người dùng chọn thủ công thư mục "technician" (nếu chưa được tự động thiết lập lúc nạp file)
        async function chooseTechnicianDirectory() {
            if (typeof window.showDirectoryPicker === 'undefined') {
                alert("Trình duyệt này không hỗ trợ chọn thư mục trực tiếp (chỉ Chrome/Edge trên máy tính hỗ trợ). Danh sách nhân sự vẫn được lưu tự động trong trình duyệt.");
                return;
            }
            try {
                const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                const techDir = await dirHandle.getDirectoryHandle('technician', { create: true });
                technicianDirHandle = techDir;
                await saveTechnicianDirHandleToDB(techDir);
                await loadPersonnelCsvFromFile();
                updatePersonnelDirStatusUI(true, `technician (trong "${dirHandle.name}")`);
                renderPersonnelPage();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    alert("Không thể chọn thư mục: " + err.message);
                }
            }
        }

        function exportPersonnelQrCode(name) {
            const url = location.origin + location.pathname + '?goto=workorder&assignee=' + encodeURIComponent(name);
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'personnelQrModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 360px; text-align: center;">
                    <div class="modal-header">
                        <span class="modal-title">📱 Mã QR việc — ${rcaEsc(name)}</span>
                        <button class="close-modal" onclick="document.getElementById('personnelQrModal').remove()">✖</button>
                    </div>
                    <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 10px;">
                        Mã cố định riêng của <strong>${rcaEsc(name)}</strong> — dùng lại được cho mọi lần giao việc sau này, không cần tạo lại. Quét bằng điện thoại, đăng nhập Google, hệ thống sẽ tự mở tab "Việc ngày" và <strong>chỉ hiển thị đúng việc được giao cho ${rcaEsc(name)}</strong>.
                    </p>
                    <div id="personnelQrCanvas" style="display:flex; justify-content:center; margin:10px 0; background:white; padding:12px; border-radius:8px;"></div>
                    <div id="personnelQrError" style="color: var(--color-rose); font-size: 0.75rem; display: none;"></div>
                    <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 8px; word-break: break-all;">${url}</div>
                </div>
            `;
            document.body.appendChild(modal);
            try {
                if (typeof QRCode === 'undefined') throw new Error('QRCode library not loaded');
                new QRCode(document.getElementById('personnelQrCanvas'), {
                    text: url, width: 240, height: 240,
                    colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M
                });
            } catch (err) {
                console.error('Lỗi tạo mã QR:', err);
                document.getElementById('personnelQrCanvas').style.display = 'none';
                const errEl = document.getElementById('personnelQrError');
                if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Không tạo được mã QR: ' + err.message; }
            }
        }

