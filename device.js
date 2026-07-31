        function renderSavedFileActivation(handle) {
            fileListContainer.innerHTML = `
                <div style="background: rgba(14, 165, 233, 0.1); border: 1px dashed var(--color-sky); padding: 12px; border-radius: 6px; text-align: center;">
                    <p style="font-size: 0.8rem; margin-bottom: 8px; color: var(--text-muted);">♻️ Phát hiện file cũ đã mở trước đó:</p>
                    <strong style="font-size: 0.85rem; color: white; display: block; margin-bottom: 10px; word-break: break-all;">${handle.name}</strong>
                    <button id="btnReactivate" class="btn btn-sky" style="font-size: 0.75rem; width: 100%; padding: 6px 10px;">Kích hoạt nhanh</button>
                </div>
            `;
            
            document.getElementById('btnReactivate').onclick = async () => {
                try {
                    const options = { mode: 'readwrite' };
                    if (await handle.queryPermission(options) === 'granted' || await handle.requestPermission(options) === 'granted') {
                        const file = await handle.getFile();
                        loadedFiles = [];
                        await processAndStoreFile(file, handle);
                        renderFileList();
                        switchFile(0);
                        alert(`Đã khôi phục liên kết trực tiếp thành công tới:\n"${handle.name}"`);
                    }
                } catch (err) {
                    alert("Không thể phục hồi liên kết file: " + err.message);
                }
            };
        }

        // --- LOCAL STORAGE: KẾ HOẠCH BẢO TRÌ ---

        function saveDeviceLogsToStorage() {
            localStorage.setItem('deviceLogs', JSON.stringify(deviceLogs));
        }

        function loadDeviceLogsFromStorage() {
            const stored = localStorage.getItem('deviceLogs');
            if (stored) {
                try {
                    deviceLogs = JSON.parse(stored);
                } catch (e) {
                    console.error("Lỗi khôi phục nhật ký bảo trì:", e);
                    deviceLogs = {};
                }
            }
        }

        function addDeviceLogEntry(itemCode, entry) {
            if (!deviceLogs[itemCode]) deviceLogs[itemCode] = [];
            deviceLogs[itemCode].unshift(entry); // Mới nhất lên đầu
            saveDeviceLogsToStorage();
        }

        // --- INDEXEDDB: LƯU HANDLE THƯ MỤC NHẬT KÝ (FILE SYSTEM ACCESS API) ---
        async function saveLogDirHandleToDB(handle) {
            try {
                const db = await openDB();
                const tx = db.transaction(storeName, "readwrite");
                const store = tx.objectStore(storeName);
                await store.put({ id: "log_dir", handle: handle, name: handle.name });
            } catch (e) { /* Handle ảo (Google Drive) không thể lưu vào IndexedDB — bỏ qua an toàn */ }
        }

        async function getLogDirHandleFromDB() {
            const db = await openDB();
            return new Promise((resolve) => {
                const tx = db.transaction(storeName, "readonly");
                const store = tx.objectStore(storeName);
                const request = store.get("log_dir");
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            });
        }

        // --- INDEXEDDB: LƯU HANDLE THƯ MỤC DỰ ÁN (để "Kích hoạt nhanh" ở lần mở sau) ---
        async function saveProjectDirHandleToDB(handle) {
            try {
                const db = await openDB();
                const tx = db.transaction(storeName, "readwrite");
                const store = tx.objectStore(storeName);
                await store.put({ id: "project_root", handle: handle, name: handle.name });
            } catch (e) { /* Handle ảo (Google Drive) không thể lưu vào IndexedDB — bỏ qua an toàn */ }
        }

        async function getProjectDirHandleFromDB() {
            const db = await openDB();
            return new Promise((resolve) => {
                const tx = db.transaction(storeName, "readonly");
                const store = tx.objectStore(storeName);
                const request = store.get("project_root");
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            });
        }

        // Thẻ "Kích hoạt nhanh thư mục dự án" hiển thị khi phát hiện thư mục dự án đã ghi nhớ từ lần trước
        function renderProjectQuickActivation(handle) {
            fileListContainer.innerHTML = `
                <div style="background: rgba(126, 34, 206, 0.1); border: 1px dashed var(--color-violet); padding: 12px; border-radius: 6px; text-align: center;">
                    <p style="font-size: 0.8rem; margin-bottom: 8px; color: var(--text-muted);">📂 Thư mục dự án đã ghi nhớ:</p>
                    <strong style="font-size: 0.85rem; color: white; display: block; margin-bottom: 10px; word-break: break-all;">${handle.name}</strong>
                    <button id="btnQuickActivateProject" class="btn btn-violet" style="font-size: 0.75rem; width: 100%; padding: 6px 10px;">🚀 Kích hoạt nhanh</button>
                </div>
            `;
            document.getElementById('btnQuickActivateProject').onclick = async () => {
                const btn = document.getElementById('btnQuickActivateProject');
                btn.disabled = true;
                btn.textContent = 'Đang kích hoạt...';
                try {
                    const options = { mode: 'readwrite' };
                    let granted = await handle.queryPermission(options);
                    if (granted !== 'granted') granted = await handle.requestPermission(options);
                    if (granted !== 'granted') {
                        alert("Bạn cần cấp quyền truy cập để kích hoạt lại thư mục dự án này.");
                        btn.disabled = false;
                        btn.textContent = '🚀 Kích hoạt nhanh';
                        return;
                    }
                    await activateProjectFolder(handle);
                } catch (err) {
                    alert("Không thể kích hoạt thư mục dự án: " + err.message);
                    btn.disabled = false;
                    btn.textContent = '🚀 Kích hoạt nhanh';
                }
            };
        }

        async function chooseProjectFolder() {
            if (typeof window.showDirectoryPicker === 'undefined') {
                alert("Trình duyệt này không hỗ trợ chọn thư mục trực tiếp (chỉ Chrome/Edge trên máy tính hỗ trợ).");
                return;
            }
            try {
                const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                await saveProjectDirHandleToDB(rootHandle);
                await activateProjectFolder(rootHandle);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    alert("Không thể kết nối thư mục dự án: " + err.message);
                }
            }
        }

        // Logic dùng chung: nạp dữ liệu + kết nối logdata/technician từ 1 thư mục dự án đã được cấp quyền
        async function activateProjectFolder(rootHandle) {
            const statusEl = document.getElementById('projectDirStatus');
            try {
                // 1. Thư mục "data" chứa (các) file dữ liệu Excel
                const dataDir = await rootHandle.getDirectoryHandle('data', { create: true });
                const excelHandles = [];
                for await (const entry of dataDir.values()) {
                    if (entry.kind === 'file' && /\.(xlsx|xls)$/i.test(entry.name)) {
                        excelHandles.push(entry);
                    }
                }

                if (excelHandles.length === 0) {
                    if (statusEl) statusEl.innerHTML = `⚠️ Đã cấp quyền thư mục "<strong>${rootHandle.name}</strong>" nhưng chưa tìm thấy file Excel nào trong thư mục con "data". Vui lòng đặt file dữ liệu (.xlsx/.xls) vào đó rồi bấm lại "📂 Chọn thư mục dự án".`;
                    alert(`Không tìm thấy file Excel nào trong thư mục con "data" của "${rootHandle.name}".\nVui lòng đặt file dữ liệu (.xlsx/.xls) vào thư mục con "data" rồi thử lại.`);
                    return;
                }

                loadedFiles = [];
                fileListContainer.innerHTML = `<div class="italic text-center">Đang tải...</div>`;
                for (const handle of excelHandles) {
                    const file = await handle.getFile();
                    await processAndStoreFile(file, handle);
                    await saveHandleToDB(handle);
                }
                const titleEl = document.getElementById('fileListSectionTitle');
                if (titleEl) titleEl.textContent = '📄 Tệp dữ liệu đang mở (thư mục "data")';
                renderFileList();
                switchFile(0);

                // 2. Thư mục "logdata" — nhật ký bảo trì
                const logDir = await rootHandle.getDirectoryHandle('logdata', { create: true });
                logDirHandle = logDir;
                await saveLogDirHandleToDB(logDir);
                updateLogDirStatusUI(true, `logdata (trong "${rootHandle.name}")`);
                await syncAdhocPlanBackupOnConnect();

                // 3. Thư mục "technician" — nhân sự
                await setupTechnicianFolder(rootHandle);

                if (statusEl) {
                    statusEl.innerHTML = `🟢 Đã kết nối thư mục dự án: <strong>${rootHandle.name}</strong><br>📊 Dữ liệu: ${excelHandles.length} file từ "data" &nbsp;•&nbsp; 📜 Nhật ký: "logdata" &nbsp;•&nbsp; 👥 Nhân sự: "technician"`;
                }

                if (!hasLoadedDataOnce) {
                    hasLoadedDataOnce = true;
                    closeSidebar();
                    switchMainTab('dashboard');
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    alert("Không thể kích hoạt thư mục dự án: " + err.message);
                }
            }
        }

        async function chooseLogDirectory() {
            if (typeof window.showDirectoryPicker === 'undefined') {
                alert("Trình duyệt này không hỗ trợ chọn thư mục trực tiếp (chỉ Chrome/Edge trên máy tính hỗ trợ).\nBạn vẫn có thể dùng nút '⬇️ Tải file CSV' trong khung Nhật ký của từng thiết bị để tải file về thủ công.");
                return;
            }
            try {
                const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                logDirHandle = handle;
                await saveLogDirHandleToDB(handle);
                updateLogDirStatusUI(true, handle.name);
                await syncAdhocPlanBackupOnConnect();
                alert(`Đã kết nối thư mục nhật ký: "${handle.name}".\nTừ giờ mỗi thiết bị khi hoàn thành bảo trì sẽ tự động có/ghi 1 file .csv riêng trong thư mục này.`);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    alert("Không thể chọn thư mục: " + err.message);
                }
            }
        }

        async function tryRestoreLogDirHandle() {
            const saved = await getLogDirHandleFromDB();
            if (!saved || !saved.handle) {
                updateLogDirStatusUI(false);
                return;
            }
            try {
                const options = { mode: 'readwrite' };
                let granted = await saved.handle.queryPermission(options);
                if (granted !== 'granted') {
                    // Chưa xin lại quyền ngay lúc khởi động (trình duyệt yêu cầu cử chỉ người dùng),
                    // sẽ tự xin lại khi thực sự cần ghi file.
                    logDirHandle = saved.handle;
                    updateLogDirStatusUI(true, saved.handle.name, true);
                    return;
                }
                logDirHandle = saved.handle;
                updateLogDirStatusUI(true, saved.handle.name);
                await syncAdhocPlanBackupOnConnect();
            } catch (e) {
                updateLogDirStatusUI(false);
            }
        }

        function updateLogDirStatusUI(connected, name, needsReauth) {
            if (!logDirStatus) return;
            if (!connected) {
                logDirStatus.innerHTML = `Chưa kết nối thư mục. Mỗi thiết bị sẽ có 1 file .csv riêng (tên = mã thiết bị) được tự động ghi/cập nhật vào thư mục này mỗi khi hoàn thành bảo trì, và các việc bảo trì đột xuất chưa hoàn thành cũng được sao lưu tự động vào đây. Nếu trình duyệt không hỗ trợ, bạn vẫn có thể tải file .csv thủ công từ khung "Nhật ký" của từng thiết bị.`;
                logDirStatus.classList.remove('connected');
            } else {
                logDirStatus.innerHTML = `🗂️ Đã kết nối: <strong>${name}</strong>${needsReauth ? ' — cần xác nhận lại quyền ghi ở lần lưu tiếp theo.' : ''} — kế hoạch bảo trì đột xuất chưa hoàn thành đang được tự động sao lưu vào "${ADHOC_PLAN_BACKUP_FILENAME}".`;
                logDirStatus.classList.add('connected');
            }
        }

        // --- BẢO VỆ DỮ LIỆU: SAO LƯU KẾ HOẠCH BẢO TRÌ ĐỘT XUẤT CHƯA HOÀN THÀNH RA FILE .CSV ---
        // (Không chỉ dựa vào localStorage — nếu người dùng xoá dữ liệu duyệt web thì vẫn khôi phục được từ file này)
        const ADHOC_PLAN_BACKUP_FILENAME = 'KeHoach_BaoTriDotXuat_ChuaHoanThanh.csv';


        function resultLabel(code) {
            if (code === 'pass') return 'Đạt';
            if (code === 'fail') return 'Không đạt';
            if (code === 'note') return 'Đạt, có lưu ý';
            return code || '';
        }

        function buildDeviceLogCsv(itemCode) {
            const entries = (deviceLogs[itemCode] || []).slice().sort((a, b) => (a.performedAt < b.performedAt ? -1 : 1));
            const header = ['STT', 'Ngày giờ thực hiện', 'Loại chu kỳ', 'Nội dung công việc', 'Vật tư thay thế', 'Người thực hiện', 'Người kiểm tra', 'Kết quả', 'Thời gian dừng máy (phút)', 'Ghi chú', 'Thời điểm ghi nhận hệ thống'];
            const lines = [header.map(csvEscape).join(',')];
            entries.forEach((e, idx) => {
                lines.push([
                    idx + 1,
                    e.performedAt,
                    e.cycleLabel || '',
                    e.jobText || '',
                    e.materials || '',
                    e.performedBy || '',
                    e.checkedBy || '',
                    resultLabel(e.result),
                    e.downtimeMinutes || '',
                    e.notes || '',
                    e.recordedAt || ''
                ].map(csvEscape).join(','));
            });
            return '\uFEFF' + lines.join('\r\n'); // BOM để Excel hiển thị đúng tiếng Việt
        }

        async function writeDeviceLogFile(itemCode) {
            const fileName = sanitizeFileName(itemCode) + '.csv';
            if (appMode === 'drive' && driveLogFolderId) {
                try {
                    const existing = await driveFindFileByName(driveLogFolderId, fileName);
                    await driveUploadFile(driveLogFolderId, fileName, buildDeviceLogCsv(itemCode), 'text/csv', existing ? existing.id : null);
                } catch (err) {
                    console.error("Lỗi ghi file nhật ký lên Drive:", err);
                    alert(`Không thể ghi file nhật ký "${fileName}" lên Google Drive: ${err.message}`);
                }
                return;
            }
            if (!logDirHandle) return;
            try {
                const options = { mode: 'readwrite' };
                if (await logDirHandle.queryPermission(options) !== 'granted') {
                    if (await logDirHandle.requestPermission(options) !== 'granted') {
                        console.warn("Không có quyền ghi vào thư mục nhật ký.");
                        return;
                    }
                }
                const fileHandle = await logDirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(buildDeviceLogCsv(itemCode));
                await writable.close();
                updateLogDirStatusUI(true, logDirHandle.name);
            } catch (err) {
                console.error("Lỗi ghi file nhật ký thiết bị:", err);
                alert(`Không thể tự động ghi file nhật ký cho thiết bị "${itemCode}" (thư mục có thể đã bị di chuyển/mất quyền). Bạn có thể dùng nút "⬇️ Tải file CSV" trong khung Nhật ký để tải về thủ công.`);
            }
        }

        function downloadDeviceLogCsv(itemCode) {
            const csv = buildDeviceLogCsv(itemCode);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = sanitizeFileName(itemCode) + '.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }

        // --- CẬP NHẬT DỮ LIỆU BẢO TRÌ VÀO DÒNG EXCEL (DÙNG CHUNG CHO HOÀN THÀNH ĐƠN LẺ & HÀNG LOẠT) ---

        function applyMaintenanceCompletion(rowIdx, cycleType, timestamp) {
            const file = loadedFiles[currentFileIdx];
            const struct = analyzeStructure(file.rows);
            const row = file.rows[rowIdx];
            const dateOnly = timestamp.split(' ')[0];

            let targetLastCol = -1;
            let targetHistCol = -1;

            if (cycleType === 'day') {
                targetLastCol = struct.lastMaintDay;
                targetHistCol = struct.historyDay;
            } else if (cycleType === 'month') {
                targetLastCol = struct.lastMaintMonth;
                targetHistCol = struct.historyMonth;
            } else if (cycleType === 'year') {
                targetLastCol = struct.lastMaintYear;
                targetHistCol = struct.historyYear;
            }

            row[targetLastCol] = dateOnly;

            let histStr = row[targetHistCol] ? String(row[targetHistCol]).trim() : "";
            let dates = histStr ? histStr.split(',') : [];
            dates.unshift(timestamp);
            if (dates.length > 10) dates = dates.slice(0, 10);
            row[targetHistCol] = dates.join(',');
        }

        // --- MODAL: GHI NHẬT KÝ KHI HOÀN THÀNH 1 HẠNG MỤC BẢO TRÌ ---
        function openCompleteLogModal(planId) {
            const planItem = maintPlan.find(p => p.planId === planId);
            if (!planItem) return;
            if (currentFileIdx === -1) {
                alert("Vui lòng kích hoạt/nạp lại file trước để cập nhật dữ liệu!");
                return;
            }

            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const defaultDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'completeLogModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 520px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <span class="modal-title">📝 Ghi nhận hoàn thành bảo trì</span>
                        <button class="close-modal" onclick="closeCompleteLogModal()">✖</button>
                    </div>
                    <div style="font-size: 0.85rem; margin-bottom: 12px; color: white;">
                        <strong style="color: var(--color-sky);">${planItem.item}</strong> — ${planItem.name}<br>
                        <span style="color: var(--text-muted); font-size: 0.78rem;">${planItem.cycleLabel} (Chu kỳ: ${planItem.cycleVal})</span>
                    </div>
                    <form id="completeLogForm" onsubmit="confirmCompleteWithLog(event, '${planId}')">
                        <div class="log-form-group">
                            <label>Ngày giờ thực hiện *</label>
                            <input type="datetime-local" id="log_performedAt" class="search-input" value="${defaultDateTime}" required>
                        </div>
                        <div class="log-form-group">
                            <label>Người thực hiện *</label>
                            <select id="log_performedBy" class="search-input" required>${personnelOptionsHtml(planItem.assignedTo)}</select>
                        </div>
                        <div class="log-form-group">
                            <label>Người kiểm tra / giám sát</label>
                            <select id="log_checkedBy" class="search-input">${personnelOptionsHtml('')}</select>
                        </div>
                        <div class="log-form-group">
                            <label>Vật tư thay thế</label>
                            <textarea id="log_materials" class="log-textarea" placeholder="VD: 2x vòng bi 6205, 1x dây curoa A-40..."></textarea>
                        </div>
                        <div class="log-form-group">
                            <label>Kết quả *</label>
                            <select id="log_result" class="search-input" required>
                                <option value="pass">✅ Đạt</option>
                                <option value="note">⚠️ Đạt, có lưu ý</option>
                                <option value="fail">❌ Không đạt</option>
                            </select>
                        </div>
                        <div class="log-form-group">
                            <label>Thời gian dừng máy (phút)</label>
                            <input type="number" min="0" id="log_downtime" class="search-input" placeholder="0">
                        </div>
                        <div class="log-form-group">
                            <label>Ghi chú</label>
                            <textarea id="log_notes" class="log-textarea" placeholder="Tình trạng, đề xuất, sự cố phát sinh..."></textarea>
                        </div>
                        <div class="log-form-group" style="margin-bottom: 12px;">
                            <div class="rca-add-box">
                                <div class="rca-add-box-title">➕ Thêm vào</div>
                                <div class="rca-add-box-option">
                                    <input type="checkbox" id="log_addToAdhoc" style="width: 16px; height: 16px; accent-color: var(--color-violet); flex-shrink: 0;">
                                    <label for="log_addToAdhoc" style="color: var(--color-violet);">🔧 Bảo trì đột xuất <span style="font-weight:400; color:var(--text-muted); font-size:0.7rem;">(dựa theo nội dung Ghi chú ở trên)</span></label>
                                </div>
                                <div class="rca-add-box-option">
                                    <input type="checkbox" id="log_addToRCA" style="width: 16px; height: 16px; accent-color: var(--color-rose); flex-shrink: 0;">
                                    <label for="log_addToRCA" style="color: var(--color-rose);">🔍 RCA <span style="font-weight:400; color:var(--text-muted); font-size:0.7rem;">(phân tích nguyên nhân gốc rễ)</span></label>
                                </div>
                            </div>
                        </div>
                        <div class="log-actions">
                            <button type="button" class="btn btn-slate" onclick="closeCompleteLogModal()">Hủy</button>
                            <button type="submit" class="btn btn-emerald">✔️ Xác nhận hoàn thành</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
            setTimeout(() => document.getElementById('log_performedBy').focus(), 50);
        }

        function closeCompleteLogModal() {
            const modal = document.getElementById('completeLogModal');
            if (modal) modal.remove();
        }

        function confirmCompleteWithLog(event, planId) {
            event.preventDefault();
            const planItem = maintPlan.find(p => p.planId === planId);
            if (!planItem) return;

            const performedAtRaw = document.getElementById('log_performedAt').value; // yyyy-MM-ddTHH:mm
            const performedAt = performedAtRaw.replace('T', ' ');
            const performedBy = document.getElementById('log_performedBy').value.trim();
            const checkedBy = document.getElementById('log_checkedBy').value.trim();
            const materials = document.getElementById('log_materials').value.trim();
            const result = document.getElementById('log_result').value;
            const downtimeMinutes = document.getElementById('log_downtime').value.trim();
            const notes = document.getElementById('log_notes').value.trim();
            const addToAdhoc = document.getElementById('log_addToAdhoc').checked;
            const addToRCA = document.getElementById('log_addToRCA').checked;

            applyMaintenanceCompletion(planItem.rowIdx, planItem.cycleType, performedAt);

            addDeviceLogEntry(planItem.item, {
                id: Date.now() + Math.random().toString(36).substr(2, 5),
                performedAt: performedAt,
                cycleType: planItem.cycleType,
                cycleLabel: planItem.cycleLabel,
                jobText: planItem.jobText || '',
                materials: materials,
                performedBy: performedBy,
                checkedBy: checkedBy,
                result: result,
                downtimeMinutes: downtimeMinutes,
                notes: notes,
                recordedAt: getCurrentTimestamp()
            });
            writeDeviceLogFile(planItem.item);

            if (addToAdhoc) {
                if (!notes) {
                    alert('Bạn đã tích "Thêm vào kế hoạch bảo trì" nhưng chưa nhập Ghi chú — vui lòng nhập nội dung cần theo dõi/xử lý.');
                } else {
                    addToAdhocPlan(planItem.rowIdx, notes, `Theo dõi từ nhật ký ${planItem.cycleLabel.toLowerCase()} ngày ${performedAt}`);
                }
            }

            let newRcaRecord = null;
            if (addToRCA) {
                newRcaRecord = createRcaRecord(
                    { rowIdx: planItem.rowIdx, item: planItem.item, name: planItem.name, area: planItem.area },
                    notes || planItem.jobText || '',
                    'cyclic',
                    `${planItem.cycleLabel || 'Bảo trì theo chu kỳ'} — hoàn thành ${performedAt}`
                );
            }

            setUnsavedFlag(true);
            maintPlan = maintPlan.filter(p => p.planId !== planId);
            savePlanToLocalStorage();
            closeCompleteLogModal();
            processDataset();
            renderMaintPlan();
            woSyncLinkedOrderOnPlanComplete('cyclic', planId, { performedAt, performedBy, notes });

            if (newRcaRecord) {
                switchMainTab('rca');
                openRcaEditor(newRcaRecord.id);
            }
        }

        // Định dạng lại "Ngày giờ thực hiện" (yyyy-MM-dd HH:mm) thành 2 dòng: dd-mm-yyyy / hh:mm
        function formatLogDateTimeHtml(performedAt) {
            if (!performedAt) return '';
            const parts = String(performedAt).split(' ');
            const datePart = parts[0] || '';
            const timePart = parts[1] || '';
            const dateSegs = datePart.split('-'); // yyyy-MM-dd
            const dateFormatted = dateSegs.length === 3 ? `${dateSegs[2]}-${dateSegs[1]}-${dateSegs[0]}` : datePart;
            const timeFormatted = timePart ? timePart.slice(0, 5) : ''; // hh:mm
            return `${dateFormatted}${timeFormatted ? '<br>' + timeFormatted : ''}`;
        }

        // Rút gọn nội dung cột "Chu kỳ" trong nhật ký bảo trì thiết bị: Ngày / Tháng / Năm / Đột xuất
        function shortCycleLabel(e) {
            const type = e.cycleType || '';
            if (type === 'day') return 'Ngày';
            if (type === 'month') return 'Tháng';
            if (type === 'year') return 'Năm';
            if (type === 'adhoc') return 'Đột xuất';
            return e.cycleLabel || '';
        }

        // --- MODAL: XEM LỊCH SỬ NHẬT KÝ BẢO TRÌ CỦA 1 THIẾT BỊ (DẠNG BẢNG/PHIẾU) ---
        // --- MODAL: XEM LỊCH SỬ NHẬT KÝ BẢO TRÌ CỦA 1 THIẾT BỊ (DẠNG BẢNG/PHIẾU) ---
        let deviceLogModalFilter = { from: '', to: '' }; // Bộ lọc khoảng thời gian đang áp dụng cho modal nhật ký thiết bị

        // Lấy danh sách nhật ký của 1 thiết bị, đã lọc theo khoảng thời gian (nếu có) và sắp xếp mới nhất lên đầu
        function getFilteredSortedDeviceLogs(item) {
            let entries = (deviceLogs[item] || []).slice();
            if (deviceLogModalFilter.from) entries = entries.filter(e => (e.performedAt || '').slice(0, 10) >= deviceLogModalFilter.from);
            if (deviceLogModalFilter.to) entries = entries.filter(e => (e.performedAt || '').slice(0, 10) <= deviceLogModalFilter.to);
            entries.sort((a, b) => (a.performedAt > b.performedAt ? -1 : (a.performedAt < b.performedAt ? 1 : 0))); // Mới nhất lên trên đầu
            return entries;
        }

        function buildDeviceLogTableRows(entries) {
            let rows = '';
            entries.forEach((e, idx) => {
                rows += `
                    <tr>
                        <td style="text-align:center;">${idx + 1}</td>
                        <td style="white-space:nowrap; text-align:center;">${formatLogDateTimeHtml(e.performedAt)}</td>
                        <td style="text-align:center;">${(e.performedBy || '').replace(/</g,'&lt;')}</td>
                        <td style="text-align:center;">${(e.checkedBy || '—').replace(/</g,'&lt;')}</td>
                        <td style="text-align:center;">${shortCycleLabel(e)}</td>
                        <td style="white-space:pre-wrap; text-align:justify;">${(e.jobText || '').replace(/</g,'&lt;')}</td>
                        <td style="white-space:pre-wrap; text-align:center;">${(e.materials || '—').replace(/</g,'&lt;')}</td>
                        <td style="text-align:center;">${resultLabel(e.result)}</td>
                        <td style="white-space:pre-wrap; text-align:justify;">${(e.notes || '—').replace(/</g,'&lt;')}</td>
                    </tr>
                `;
            });
            return rows;
        }

        function buildDeviceLogModalBodyHtml(rowIdx) {
            const device = allValidRows.find(d => d.rowIdx === rowIdx);
            if (!device) return '';
            const entries = getFilteredSortedDeviceLogs(device.item);
            const totalCount = (deviceLogs[device.item] || []).length;
            const isFiltered = !!(deviceLogModalFilter.from || deviceLogModalFilter.to);

            let tableHtml = '';
            if (entries.length === 0) {
                tableHtml = `<div class="italic text-center" style="color: var(--text-muted); padding: 20px 0;">${totalCount === 0 ? 'Chưa có nhật ký bảo trì nào được ghi nhận cho thiết bị này.' : 'Không có bản ghi nào trong khoảng thời gian đã lọc.'}</div>`;
            } else {
                tableHtml = `
                    <div class="log-table-wrap">
                        <table class="log-report-table">
                            <thead>
                                <tr>
                                    <th>STT</th><th>Ngày</th><th>Thực hiện</th><th>Kiểm tra</th>
                                    <th>Chu kỳ</th><th>Nội dung công việc</th><th>Vật tư thay thế</th><th>Kết quả</th><th>Ghi chú</th>
                                </tr>
                            </thead>
                            <tbody>${buildDeviceLogTableRows(entries)}</tbody>
                        </table>
                    </div>
                `;
            }

            return `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:0.78rem; color:var(--text-muted);">${entries.length}${isFiltered ? ` / ${totalCount}` : ''} lần ghi nhận${isFiltered ? ' (đã lọc)' : ''} — mới nhất hiển thị trên cùng</span>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-slate" style="font-size:0.75rem; padding:6px 10px;" onclick="printDeviceLog(${rowIdx})">📠 In nhật ký</button>
                        <button class="btn btn-sky" style="font-size:0.75rem; padding:6px 10px;" onclick="downloadDeviceLogCsv('${device.item.replace(/'/g, "\\'")}')">⬇️ Tải file CSV</button>
                    </div>
                </div>
                ${tableHtml}
            `;
        }

        function refreshDeviceLogModalBody(rowIdx) {
            const body = document.getElementById('deviceLogModalBody');
            if (body) body.innerHTML = buildDeviceLogModalBodyHtml(rowIdx);
        }

        function applyDeviceLogFilter(rowIdx) {
            deviceLogModalFilter.from = document.getElementById('logFilterFrom').value || '';
            deviceLogModalFilter.to = document.getElementById('logFilterTo').value || '';
            if (deviceLogModalFilter.from && deviceLogModalFilter.to && deviceLogModalFilter.from > deviceLogModalFilter.to) {
                alert("Ngày bắt đầu phải trước ngày kết thúc.");
                return;
            }
            refreshDeviceLogModalBody(rowIdx);
        }

        function clearDeviceLogFilter(rowIdx) {
            deviceLogModalFilter = { from: '', to: '' };
            const f = document.getElementById('logFilterFrom');
            const t = document.getElementById('logFilterTo');
            if (f) f.value = '';
            if (t) t.value = '';
            refreshDeviceLogModalBody(rowIdx);
        }

        function openDeviceLogModal(rowIdx) {
            const device = allValidRows.find(d => d.rowIdx === rowIdx);
            if (!device) return;
            deviceLogModalFilter = { from: '', to: '' };
            const info = getCompanyInfo();

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'deviceLogModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 900px; max-width: 96%; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <span class="modal-title">📜 Nhật ký bảo trì thiết bị</span>
                        <button class="close-modal" onclick="closeDeviceLogModal()">✖</button>
                    </div>

                    <div class="log-report-header">
                        <div class="company-block">
                            <strong>${info.company}</strong>
                            <div>${info.department}</div>
                            ${info.lineName ? `<div>${info.lineName}</div>` : ''}
                        </div>
                        <div style="text-align:right; font-size:0.78rem; color:var(--text-muted);">
                            Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}
                        </div>
                    </div>
                    <div class="log-report-title">
                        <h3>Nhật Ký Bảo Trì Thiết Bị</h3>
                        <span><strong>${device.item}</strong> — ${device.area ? device.area + ' — ' : ''}${device.name}${device.model ? ' — Model: ' + device.model : ''}</span>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap; background:var(--bg-panel-dark); padding:8px 10px; border-radius:6px; border:1px solid var(--border-color);">
                        <label style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">🗓️ Lọc theo thời gian:</label>
                        <input type="date" id="logFilterFrom" class="search-input" style="width:auto;">
                        <span style="color:var(--text-muted); font-size:0.75rem;">→</span>
                        <input type="date" id="logFilterTo" class="search-input" style="width:auto;">
                        <button class="btn btn-emerald" style="font-size:0.72rem; padding:5px 10px;" onclick="applyDeviceLogFilter(${rowIdx})">🔍 Lọc</button>
                        <button class="btn btn-slate" style="font-size:0.72rem; padding:5px 10px;" onclick="clearDeviceLogFilter(${rowIdx})">✖ Bỏ lọc</button>
                    </div>

                    <div id="deviceLogModalBody">${buildDeviceLogModalBodyHtml(rowIdx)}</div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function closeDeviceLogModal() {
            const modal = document.getElementById('deviceLogModal');
            if (modal) modal.remove();
        }

        // --- MÃ QR TRA CỨU NHANH LỊCH SỬ BẢO TRÌ (QUÉT TỪ ĐIỆN THOẠI, KHÔNG CẦN MẠNG) ---
        // Mã QR chứa 1 trang HTML tự chứa (data URI) hiển thị lịch sử bảo trì gần nhất của thiết bị
        function buildDeviceQrPageHtml(device, entries) {
            const info = getCompanyInfo();
            const rows = entries.map((e, idx) => `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${formatLogDateTimeHtml(e.performedAt).replace('<br>', ' ')}</td>
                    <td>${(e.performedBy || '').replace(/</g,'&lt;')}</td>
                    <td>${shortCycleLabel(e)}</td>
                    <td>${(e.jobText || '').slice(0, 60).replace(/</g,'&lt;')}</td>
                    <td>${resultLabel(e.result)}</td>
                </tr>
            `).join('');
            return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
                `<title>NK ${device.item}</title><style>body{font-family:Arial,sans-serif;margin:0;padding:10px;background:#0f172a;color:#e2e8f0;}` +
                `h2{font-size:15px;margin:0 0 3px;}p{font-size:11px;color:#94a3b8;margin:0 0 10px;}` +
                `table{width:100%;border-collapse:collapse;font-size:10px;}th,td{border:1px solid #334155;padding:4px;text-align:left;}` +
                `th{background:#1e293b;}</style></head><body>` +
                `<h2>${device.item} — ${device.name}</h2>` +
                `<p>${info.company}${device.area ? ' • Khu vực: ' + device.area : ''}</p>` +
                `<table><thead><tr><th>#</th><th>Ngày</th><th>Thực hiện</th><th>Chu kỳ</th><th>Nội dung</th><th>KQ</th></tr></thead>` +
                `<tbody>${rows || '<tr><td colspan="6">Chưa có nhật ký</td></tr>'}</tbody></table></body></html>`;
        }

        function openDeviceQrModal(rowIdx) {
            const device = allValidRows.find(d => d.rowIdx === rowIdx);
            if (!device) return;
            const allEntries = (deviceLogs[device.item] || []).slice().sort((a, b) => (a.performedAt > b.performedAt ? -1 : 1));
            const entries = allEntries.slice(0, 25);

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'deviceQrModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 360px; text-align: center;">
                    <div class="modal-header">
                        <span class="modal-title">📱 Mã QR — ${device.item}</span>
                        <button class="close-modal" onclick="document.getElementById('deviceQrModal').remove()">✖</button>
                    </div>
                    <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 10px;">Quét mã bằng camera điện thoại để xem lịch sử bảo trì của thiết bị <strong>${device.item}</strong> — không cần mạng, không cần cài app.</p>
                    <div id="deviceQrCanvas" style="display: flex; justify-content: center; margin: 10px 0; background: white; padding: 12px; border-radius: 8px;"></div>
                    <div id="deviceQrError" style="color: var(--color-rose); font-size: 0.75rem; display: none;"></div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 8px;">
                        Hiển thị ${entries.length} lần ghi nhận gần nhất${allEntries.length > 25 ? ' (giới hạn 25 bản ghi mới nhất để mã QR quét được)' : ''}.
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            try {
                if (typeof QRCode === 'undefined') throw new Error('QRCode library not loaded');
                const pageHtml = buildDeviceQrPageHtml(device, entries);
                const dataUri = 'data:text/html;charset=utf-8,' + encodeURIComponent(pageHtml);
                new QRCode(document.getElementById('deviceQrCanvas'), {
                    text: dataUri,
                    width: 260,
                    height: 260,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.L
                });
            } catch (err) {
                console.error("Lỗi tạo mã QR:", err);
                const canvasEl = document.getElementById('deviceQrCanvas');
                if (canvasEl) canvasEl.style.display = 'none';
                const errEl = document.getElementById('deviceQrError');
                if (errEl) {
                    errEl.style.display = 'block';
                    errEl.innerText = 'Không thể tạo mã QR (có thể do dữ liệu nhật ký quá lớn hoặc mất kết nối mạng để tải thư viện tạo mã QR). Bạn có thể dùng chức năng "In nhật ký" hoặc "Tải file CSV" thay thế.';
                }
            }
        }

        // --- HÀM DÙNG CHUNG: MỞ CỬA SỔ IN VỚI TIÊU ĐỀ CÔNG TY/PHÒNG BAN ---

        function printDeviceLog(rowIdx) {
            const device = allValidRows.find(d => d.rowIdx === rowIdx);
            if (!device) return;
            const entries = getFilteredSortedDeviceLogs(device.item);
            if (entries.length === 0) {
                alert("Không có bản ghi nhật ký nào để in (thiết bị chưa có nhật ký, hoặc không có bản ghi nào trong khoảng thời gian đã lọc)!");
                return;
            }

            const tableRows = buildDeviceLogTableRows(entries);
            const bodyHtml = `
                <table>
                    <thead>
                        <tr>
                            <th style="width:4%;">STT</th><th style="width:9%;">Ngày</th><th style="width:11%;">Thực hiện</th>
                            <th style="width:11%;">Kiểm tra</th><th style="width:9%;">Chu kỳ</th><th style="width:24%;">Nội dung công việc</th>
                            <th style="width:14%;">Vật tư thay thế</th><th style="width:6%;">Kết quả</th><th style="width:12%;">Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>

                <div class="footer-sig">
                    <div class="sig-box">
                        <p><strong>Người lập phiếu</strong></p>
                        <span style="font-size:11px; color:#555;">(Ký & ghi rõ họ tên)</span>
                        <br><br><br><br><br>
                        <p>.......................................</p>
                    </div>
                    <div class="sig-box">
                        <p><strong>Người kiểm tra</strong></p>
                        <span style="font-size:11px; color:#555;">(Ký & ghi rõ họ tên)</span>
                        <br><br><br><br><br>
                        <p>.......................................</p>
                    </div>
                    <div class="sig-box">
                        <p><strong>Trưởng phòng KTCL</strong></p>
                        <span style="font-size:11px; color:#555;">(Phê duyệt)</span>
                        <br><br><br><br><br>
                        <p>.......................................</p>
                    </div>
                </div>
            `;
            const lineInfo = getCompanyInfo().lineName;
            const deviceSubTitle = `${device.area ? device.area + ' — ' : ''}${device.item} — ${device.name}${device.model ? ' — Model: ' + device.model : ''}`;
            const filterLabel = (deviceLogModalFilter.from || deviceLogModalFilter.to)
                ? `Khoảng thời gian: ${deviceLogModalFilter.from ? deviceLogModalFilter.from.split('-').reverse().join('/') : '...'} → ${deviceLogModalFilter.to ? deviceLogModalFilter.to.split('-').reverse().join('/') : '...'}`
                : '';
            const printSubTitle = [lineInfo, deviceSubTitle, filterLabel].filter(Boolean).join('<br>');
            openPrintWindow('NHẬT KÝ BẢO TRÌ THIẾT BỊ', printSubTitle, bodyHtml);
        }

        // --- CÀI ĐẶT: THÔNG TIN CÔNG TY / PHÒNG BAN (DÙNG CHUNG CHO CÁC PHIẾU IN & NHẬT KÝ) ---

        function getDeviceImportance(rowIdx) {
            if (currentFileIdx === -1) return 0;
            const row = loadedFiles[currentFileIdx].rows[rowIdx];
            if (!row) return 0;
            const val = parseInt(row[0]);
            return isNaN(val) ? 0 : Math.max(0, Math.min(3, val));
        }

        // Nhấp vào sao thứ `level`: nếu thiết bị đang ở đúng mức đó thì bỏ đánh giá (về rỗng),
        // ngược lại ghi mức độ quan trọng = level (1 = *, 2 = **, 3 = ***) vào cột A (rate) của dòng dữ liệu Excel tương ứng
        function setDeviceImportance(rowIdx, level, event) {
            if (event) event.stopPropagation();
            if (currentFileIdx === -1) return;
            const row = loadedFiles[currentFileIdx].rows[rowIdx];
            if (!row) return;

            const current = getDeviceImportance(rowIdx);
            row[0] = (current === level) ? "" : level;

            setUnsavedFlag(true);
            processDataset();
        }

        function getImportanceLabel(level) {
            if (level === 3) return 'Rất quan trọng';
            if (level === 2) return 'Quan trọng';
            if (level === 1) return 'Ít quan trọng';
            return 'Chưa đánh giá';
        }

        // --- ĐIỀU PHỐI CHỌN FILE ---

        async function promptSetupLogFolder(fileHandle) {
            if (typeof window.showDirectoryPicker === 'undefined') return;
            const ok = confirm(`Bạn có muốn tự động thiết lập thư mục ghi Nhật ký bảo trì và Nhân sự không?\n\nHãy chọn đúng THƯ MỤC đang chứa file dữ liệu "${fileHandle.name}" bạn vừa nạp — hệ thống sẽ tự tạo thư mục con "logdata" (nhật ký) và "technician" (danh sách nhân sự, file nhan_su.csv) ngay trong đó, không cần thao tác lại về sau.\n\n(Bấm "Hủy" nếu muốn bỏ qua — bạn vẫn có thể chọn thủ công sau trong "Quản lý dữ liệu")`);
            if (!ok) {
                logFolderPromptDeclined = true;
                return;
            }
            try {
                const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                const relativePath = await dirHandle.resolve(fileHandle);
                if (!relativePath) {
                    alert(`Thư mục bạn vừa chọn không chứa file "${fileHandle.name}". Vui lòng thử lại và chọn đúng thư mục chứa file dữ liệu (bạn có thể chọn thủ công sau trong "Quản lý dữ liệu").`);
                    return;
                }
                const logDir = await dirHandle.getDirectoryHandle('logdata', { create: true });
                logDirHandle = logDir;
                await saveLogDirHandleToDB(logDir);
                updateLogDirStatusUI(true, `logdata (trong "${dirHandle.name}")`);
                await syncAdhocPlanBackupOnConnect();
                await setupTechnicianFolder(dirHandle);
                alert(`Đã tự động thiết lập thư mục nhật ký: "${dirHandle.name}/logdata".\nTừ giờ mỗi thiết bị khi hoàn thành bảo trì sẽ tự động ghi file .csv riêng vào đây.\n\nĐồng thời hệ thống cũng tự tìm/tạo thư mục "technician" trong "${dirHandle.name}" để lưu file nhân sự (nhan_su.csv).`);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("Lỗi thiết lập thư mục nhật ký tự động:", err);
                }
            }
        }

        async function handleFileOpenSelector() {
            if (typeof window.showOpenFilePicker !== 'undefined') {
                try {
                    const fileHandles = await window.showOpenFilePicker({
                        multiple: true,
                        types: [{
                            description: 'Excel Files',
                            accept: {
                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                                'application/vnd.ms-excel': ['.xls']
                            }
                        }]
                    });
                    
                    loadedFiles = [];
                    fileListContainer.innerHTML = `<div class="italic text-center">Đang tải...</div>`;
                    
                    for (const handle of fileHandles) {
                        const file = await handle.getFile();
                        await processAndStoreFile(file, handle);
                        await saveHandleToDB(handle);
                    }
                    renderFileList();
                    switchFile(0);

                    if (!logDirHandle && !logFolderPromptDeclined) {
                        await promptSetupLogFolder(fileHandles[0]);
                    }
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        alert("Lỗi nạp file: " + err.message);
                    }
                }
            } else {
                excelFiles.click();
            }
        }

        async function handleExcelUploadLegacy(e) {
            const files = e.target.files;
            if(files.length === 0) return;
            
            loadedFiles = [];
            fileListContainer.innerHTML = `<div class="italic text-center">Đang tải...</div>`;

            for (let i = 0; i < files.length; i++) {
                await processAndStoreFile(files[i], null);
            }
            renderFileList();
            switchFile(0);
        }

        function processAndStoreFile(file, handle, driveFileId) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const data = new Uint8Array(e.target.result);
                    try {
                        const workbook = XLSX.read(data, { type: 'array', cellDates: true, raw: false });
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        const arrayData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                        
                        loadedFiles.push({
                            name: file.name,
                            handle: handle,
                            driveFileId: driveFileId || null,
                            workbook: workbook,
                            sheetName: firstSheetName,
                            rows: arrayData
                        });
                    } catch (err) {
                        alert("Lỗi phân tích file Excel: " + err.message);
                    }
                    resolve();
                };
                reader.readAsArrayBuffer(file);
            });
        }

        function renderFileList() {
            fileListContainer.innerHTML = '';
            loadedFiles.forEach((f, idx) => {
                const btn = document.createElement('button');
                btn.className = `file-item ${idx === currentFileIdx ? 'active' : ''}`;
                btn.innerHTML = `
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${f.name}</span>
                `;
                btn.onclick = () => switchFile(idx);
                fileListContainer.appendChild(btn);
            });
        }

        function switchFile(idx) {
            currentFileIdx = idx;
            expandedNodes.clear(); // Thu gọn ở lần nạp file đầu tiên
            renderFileList();
            btnSaveFile.removeAttribute('disabled');
            btnSaveFile.classList.remove('btn-disabled');
            processDataset();
            renderMaintPlan();

            if (!hasLoadedDataOnce) {
                hasLoadedDataOnce = true;
                closeSidebar();
                switchMainTab('dashboard');
            }
        }

        // --- PHÂN TÍCH CẤU TRÚC BẢNG ---
        function analyzeStructure(rows) {
            let headerRowIndex = -1;
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i].map(v => String(v).toLowerCase().trim());
                if (row.includes('day') || row.includes('month') || row.includes('year') || row.includes('item') || row.includes('cabinet')) {
                    headerRowIndex = i;
                    break;
                }
            }

            if (headerRowIndex === -1) {
                for(let i=0; i<rows.length; i++) {
                    if(rows[i].some(v => v !== "")) {
                        headerRowIndex = i;
                        break;
                    }
                }
            }

            if (headerRowIndex === -1) headerRowIndex = 0;

            const headers = rows[headerRowIndex] || [];
            const normalized = headers.map(h => String(h).toLowerCase().trim());

            const findIdx = (targets) => {
                for (let target of targets) {
                    let idx = normalized.indexOf(target);
                    if (idx !== -1) return idx;
                }
                for (let i = 0; i < normalized.length; i++) {
                    for (let target of targets) {
                        if (normalized[i].includes(target)) return i;
                    }
                }
                return -1;
            };

            const struct = {
                headerRowIdx: headerRowIndex,
                headers: [...headers],
                rate: 0, // Cột A (cột đầu tiên) luôn được dùng để lưu mức độ quan trọng (0/1/2/3)
                area: findIdx(['area', 'khu vực tổng thể', 'khu vuc']),
                mainGroup: findIdx(['main group', 'nhóm chính', 'khu vực lớn', 'ma khu vuc lon']),
                subGroup: findIdx(['sub group', 'nhóm phụ', 'khu vực con', 'ma khu vuc con']),
                cabinet: findIdx(['cabinet', 'tủ điện', 'tu dien', 'cab']),
                item: findIdx(['item', 'code', 'mã', 'mã thiết bị', 'item code']),
                name: findIdx(['name', 'function', 'tên', 'chức năng', 'chuc nang']),
                model: findIdx(['model', 'mẫu', 'kiểu', 'construction']),
                power: findIdx(['power', 'power (kw)', 'p', 'công suất']),
                current: findIdx(['in     (a)', 'in (a)', 'i', 'dòng điện', 'dong dien']),
                speed: findIdx(['speed', 'vòng quay', 'tốc độ', 'rpm', 'vong quay', 'vòng/phút']),
                startingType: findIdx(['starting type', 'kiểu khởi động', 'starting', 'khởi động']),
                day: findIdx(['day']),
                jobday: findIdx(['jobday']),
                month: findIdx(['month']),
                jobmonth: findIdx(['jobmonth']),
                year: findIdx(['year']),
                jobyear: findIdx(['jobyear'])
            };

            // Đảm bảo cột A luôn có tiêu đề "Rate" (nếu ô tiêu đề đang trống)
            if (!struct.headers[0] || String(struct.headers[0]).trim() === "") {
                struct.headers[0] = "Rate";
            }

            const requiredCols = [
                { key: 'lastMaintDay', label: 'Ngày bảo trì ngày gần nhất' },
                { key: 'historyDay', label: 'Lịch sử bảo trì ngày' },
                { key: 'lastMaintMonth', label: 'Ngày bảo trì tháng gần nhất' },
                { key: 'historyMonth', label: 'Lịch sử bảo trì tháng' },
                { key: 'lastMaintYear', label: 'Ngày bảo trì năm gần nhất' },
                { key: 'historyYear', label: 'Lịch sử bảo trì năm' }
            ];

            requiredCols.forEach(col => {
                let idx = normalized.indexOf(col.label.toLowerCase());
                if (idx === -1) {
                    struct.headers.push(col.label);
                    idx = struct.headers.length - 1;
                }
                struct[col.key] = idx;
            });

            rows.forEach(r => {
                while(r.length < struct.headers.length) {
                    r.push("");
                }
            });

            rows[headerRowIndex] = struct.headers;
            return struct;
        }

        // Tự động thêm vào Kế hoạch bảo trì định kỳ mọi thiết bị đã ĐẾN HẠN/QUÁ HẠN
        // (chỉ áp dụng cho chu kỳ đã có mốc bảo trì lần trước — lần đầu tiên vẫn cần xác định thủ công).
        // Được gọi mỗi khi dữ liệu thiết bị được xử lý lại (mở file, sau khi hoàn thành công việc...).
        function autoAddDueDevicesToPlan() {
            if (currentFileIdx === -1 || !allValidRows.length) return;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const addedItems = [];

            allValidRows.forEach(device => {
                const cycles = [
                    { active: !!device.day, last: device.lastMaintDay, cycleVal: device.day, type: 'day', label: 'Ngày' },
                    { active: !!device.month, last: device.lastMaintMonth, cycleVal: device.month, type: 'month', label: 'Tháng' },
                    { active: !!device.year, last: device.lastMaintYear, cycleVal: device.year, type: 'year', label: 'Năm' }
                ].filter(c => c.active);

                cycles.forEach(c => {
                    const lastVal = (c.last || '').trim();
                    const isEmpty = !lastVal || lastVal.toLowerCase() === 'chưa có';
                    if (isEmpty) return; // chưa có mốc bảo trì lần đầu — cần xác định thủ công

                    const nextDateStr = calculateNextDate(c.last, c.cycleVal, c.type);
                    if (!nextDateStr || !nextDateStr.includes('/')) return;
                    const [d, m, y] = nextDateStr.split('/');
                    const nextDate = new Date(y, m - 1, d);
                    if (isNaN(nextDate.getTime()) || nextDate > today) return; // chưa tới hạn

                    const already = maintPlan.some(p => p.rowIdx === device.rowIdx && p.cycleType === c.type);
                    if (already) return;

                    addToPlan(device.rowIdx, c.type);
                    addedItems.push(`${device.item} — ${c.label}`);
                });
            });

            if (addedItems.length > 0) {
                console.log(`🔔 Tự động thêm ${addedItems.length} mục vào Kế hoạch bảo trì (đến hạn):`, addedItems);
                const banner = document.getElementById('planAutoAddBanner');
                if (banner) {
                    banner.textContent = `🔔 Vừa tự động thêm ${addedItems.length} mục đến hạn vào Kế hoạch: ${addedItems.slice(0, 5).join(', ')}${addedItems.length > 5 ? '...' : ''}`;
                    banner.classList.remove('hidden');
                }
            }
        }

        function processDataset() {
            if (currentFileIdx === -1) return;
            const file = loadedFiles[currentFileIdx];
            const struct = analyzeStructure(file.rows);
            allValidRows = [];

            for (let i = struct.headerRowIdx + 1; i < file.rows.length; i++) {
                const row = file.rows[i];
                
                const hasItem = struct.item !== -1 && row[struct.item] && String(row[struct.item]).trim() !== "";
                if (!hasItem) continue;

                const dayVal = struct.day !== -1 ? parseInt(row[struct.day]) : 0;
                const monthVal = struct.month !== -1 ? parseInt(row[struct.month]) : 0;
                const yearVal = struct.year !== -1 ? parseInt(row[struct.year]) : 0;

                if (isNaN(dayVal) && isNaN(monthVal) && isNaN(yearVal)) continue;
                if (!dayVal && !monthVal && !yearVal) continue;

                const rateRaw = parseInt(row[struct.rate]);

                allValidRows.push({
                    rowIdx: i,
                    rate: isNaN(rateRaw) ? 0 : Math.max(0, Math.min(3, rateRaw)),
                    area: struct.area !== -1 && row[struct.area] ? String(row[struct.area]).trim() : "",
                    mainGroup: struct.mainGroup !== -1 && row[struct.mainGroup] ? String(row[struct.mainGroup]).trim() : "",
                    subGroup: struct.subGroup !== -1 && row[struct.subGroup] ? String(row[struct.subGroup]).trim() : "",
                    cabinet: struct.cabinet !== -1 && row[struct.cabinet] ? String(row[struct.cabinet]).trim() : "",
                    item: String(row[struct.item]).trim(),
                    name: struct.name !== -1 && row[struct.name] ? String(row[struct.name]).trim() : "",
                    model: struct.model !== -1 && row[struct.model] ? String(row[struct.model]).trim() : "",
                    power: struct.power !== -1 && row[struct.power] ? String(row[struct.power]).trim() : "",
                    current: struct.current !== -1 && row[struct.current] ? String(row[struct.current]).trim() : "",
                    speed: struct.speed !== -1 && row[struct.speed] ? String(row[struct.speed]).trim() : "",
                    startingType: struct.startingType !== -1 && row[struct.startingType] ? String(row[struct.startingType]).trim() : "",
                    
                    day: isNaN(dayVal) ? 0 : dayVal,
                    jobday: struct.jobday !== -1 ? String(row[struct.jobday]).trim() : "",
                    month: isNaN(monthVal) ? 0 : monthVal,
                    jobmonth: struct.jobmonth !== -1 ? String(row[struct.jobmonth]).trim() : "",
                    year: isNaN(yearVal) ? 0 : yearVal,
                    jobyear: struct.jobyear !== -1 ? String(row[struct.jobyear]).trim() : "",

                    lastMaintDay: String(row[struct.lastMaintDay]).trim(),
                    historyDay: String(row[struct.historyDay]).trim(),
                    lastMaintMonth: String(row[struct.lastMaintMonth]).trim(),
                    historyMonth: String(row[struct.historyMonth]).trim(),
                    lastMaintYear: String(row[struct.lastMaintYear]).trim(),
                    historyYear: String(row[struct.historyYear]).trim()
                });
            }

            deviceCount.innerText = `${allValidRows.length} thiết bị`;
            renderDeviceTree();
            autoAddDueDevicesToPlan();
            if (currentMainTab === 'dashboard') {
                renderDashboard();
            }
        }

        // --- PHÂN LOẠI TRẠNG THÁI BẢO TRÌ CỦA 1 THIẾT BỊ (DÙNG CHO DASHBOARD) ---
        function classifyDeviceMaintenance(device) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const cycles = [
                { active: !!device.day, last: device.lastMaintDay, cycleVal: device.day, type: 'day', label: 'Ngày' },
                { active: !!device.month, last: device.lastMaintMonth, cycleVal: device.month, type: 'month', label: 'Tháng' },
                { active: !!device.year, last: device.lastMaintYear, cycleVal: device.year, type: 'year', label: 'Năm' }
            ].filter(c => c.active);

            let hasAnyRecord = false;
            let isOverdue = false;
            let overdueCycles = [];

            cycles.forEach(c => {
                const lastVal = (c.last || '').trim();
                const isEmpty = !lastVal || lastVal.toLowerCase() === 'chưa có' || lastVal === '';
                if (!isEmpty) {
                    hasAnyRecord = true;
                    const nextDateStr = calculateNextDate(c.last, c.cycleVal, c.type);
                    if (nextDateStr && nextDateStr.includes('/')) {
                        const [d, m, y] = nextDateStr.split('/');
                        const nextDate = new Date(y, m - 1, d);
                        if (!isNaN(nextDate.getTime()) && nextDate < today) {
                            isOverdue = true;
                            overdueCycles.push(c.label);
                        }
                    }
                }
            });

            return {
                hasCycles: cycles.length > 0,
                hasAnyRecord: hasAnyRecord,
                isOverdue: isOverdue,
                overdueCycles: overdueCycles,
                neverMaintained: cycles.length > 0 && !hasAnyRecord
            };
        }

        // --- RENDER DASHBOARD ---

        function openEditModal(rowIdx) {
            const file = loadedFiles[currentFileIdx];
            const struct = analyzeStructure(file.rows);
            const rawRow = file.rows[rowIdx];

            const item = struct.item !== -1 ? rawRow[struct.item] : "";
            const name = struct.name !== -1 ? rawRow[struct.name] : "";
            const model = struct.model !== -1 ? rawRow[struct.model] : "";
            const power = struct.power !== -1 ? rawRow[struct.power] : "";
            const current = struct.current !== -1 ? rawRow[struct.current] : "";
            const speed = struct.speed !== -1 ? rawRow[struct.speed] : "";
            const startingType = struct.startingType !== -1 ? rawRow[struct.startingType] : "";
            const day = struct.day !== -1 ? rawRow[struct.day] : "";
            const month = struct.month !== -1 ? rawRow[struct.month] : "";
            const year = struct.year !== -1 ? rawRow[struct.year] : "";
            const jobday = struct.jobday !== -1 ? rawRow[struct.jobday] : "";
            const jobmonth = struct.jobmonth !== -1 ? rawRow[struct.jobmonth] : "";
            const jobyear = struct.jobyear !== -1 ? rawRow[struct.jobyear] : "";

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'editModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 580px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <span class="modal-title">✏️ Sửa Thông Tin Thiết Bị</span>
                        <button class="close-modal" onclick="closeEditModal()">✖</button>
                    </div>
                    <form id="editForm" onsubmit="saveDeviceEdit(event, ${rowIdx})" style="display: flex; flex-direction: column; gap: 12px; font-size: 0.85rem;">
                        <div style="display: flex; gap: 10px;">
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Mã thiết bị:</label>
                                <input type="text" id="edit_item" class="search-input" value="${item}" required>
                            </div>
                            <div style="flex: 2;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Chức năng (Tên):</label>
                                <input type="text" id="edit_name" class="search-input" value="${name}" required>
                            </div>
                        </div>

                        <div style="display: flex; gap: 10px;">
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Model:</label>
                                <input type="text" id="edit_model" class="search-input" value="${model}">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Kiểu khởi động:</label>
                                <input type="text" id="edit_startingType" class="search-input" value="${startingType}">
                            </div>
                        </div>

                        <div style="display: flex; gap: 10px;">
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Công suất (kW):</label>
                                <input type="text" id="edit_power" class="search-input" value="${power}">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Dòng điện In (A):</label>
                                <input type="text" id="edit_current" class="search-input" value="${current}">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Tốc độ (rpm):</label>
                                <input type="text" id="edit_speed" class="search-input" value="${speed}">
                            </div>
                        </div>

                        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 5px 0;">
                        <h4 style="color: var(--color-sky); margin-bottom: 5px;">Chu kỳ & Nội dung công việc</h4>

                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <div style="width: 100px;">
                                <label style="display: block; font-weight: bold;">Ngày:</label>
                                <input type="number" id="edit_day" class="search-input" value="${day}" style="margin-top:3px;">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold;">Công việc chu kỳ Ngày:</label>
                                <textarea id="edit_jobday" class="search-input" rows="2" style="margin-top:3px; resize: vertical; font-family: inherit;">${jobday}</textarea>
                            </div>
                        </div>

                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <div style="width: 100px;">
                                <label style="display: block; font-weight: bold;">Tháng:</label>
                                <input type="number" id="edit_month" class="search-input" value="${month}" style="margin-top:3px;">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold;">Công việc chu kỳ Tháng:</label>
                                <textarea id="edit_jobmonth" class="search-input" rows="2" style="margin-top:3px; resize: vertical; font-family: inherit;">${jobmonth}</textarea>
                            </div>
                        </div>

                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <div style="width: 100px;">
                                <label style="display: block; font-weight: bold;">Năm:</label>
                                <input type="number" id="edit_year" class="search-input" value="${year}" style="margin-top:3px;">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold;">Công việc chu kỳ Năm:</label>
                                <textarea id="edit_jobyear" class="search-input" rows="2" style="margin-top:3px; resize: vertical; font-family: inherit;">${jobyear}</textarea>
                            </div>
                        </div>

                        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                            <button type="button" class="btn btn-slate" onclick="closeEditModal()">Hủy</button>
                            <button type="submit" class="btn btn-emerald">Xác nhận Lưu</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function closeEditModal() {
            const modal = document.getElementById('editModal');
            if (modal) modal.remove();
        }

        function saveDeviceEdit(event, rowIdx) {
            event.preventDefault();
            const file = loadedFiles[currentFileIdx];
            const struct = analyzeStructure(file.rows);
            const rawRow = file.rows[rowIdx];

            if (struct.item !== -1) rawRow[struct.item] = document.getElementById('edit_item').value;
            if (struct.name !== -1) rawRow[struct.name] = document.getElementById('edit_name').value;
            if (struct.model !== -1) rawRow[struct.model] = document.getElementById('edit_model').value;
            if (struct.startingType !== -1) rawRow[struct.startingType] = document.getElementById('edit_startingType').value;
            if (struct.power !== -1) rawRow[struct.power] = document.getElementById('edit_power').value;
            if (struct.current !== -1) rawRow[struct.current] = document.getElementById('edit_current').value;
            if (struct.speed !== -1) rawRow[struct.speed] = document.getElementById('edit_speed').value;
            
            if (struct.day !== -1) rawRow[struct.day] = document.getElementById('edit_day').value;
            if (struct.month !== -1) rawRow[struct.month] = document.getElementById('edit_month').value;
            if (struct.year !== -1) rawRow[struct.year] = document.getElementById('edit_year').value;

            if (struct.jobday !== -1) rawRow[struct.jobday] = document.getElementById('edit_jobday').value;
            if (struct.jobmonth !== -1) rawRow[struct.jobmonth] = document.getElementById('edit_jobmonth').value;
            if (struct.jobyear !== -1) rawRow[struct.jobyear] = document.getElementById('edit_jobyear').value;

            setUnsavedFlag(true);
            closeEditModal();
            processDataset();
            alert("Đã cập nhật dữ liệu thiết bị cục bộ! Hãy bấm 'Lưu dữ liệu' để đồng bộ trực tiếp vào file Excel.");
        }

        // --- LẤY DANH SÁCH GIÁ TRỊ DUY NHẤT CỦA 1 CỘT (DÙNG CHO GỢI Ý AUTOCOMPLETE) ---
        function getUniqueColumnValues(struct, key) {
            const colIdx = struct[key];
            if (colIdx === undefined || colIdx === -1) return [];
            const file = loadedFiles[currentFileIdx];
            const values = new Set();
            for (let i = struct.headerRowIdx + 1; i < file.rows.length; i++) {
                const v = file.rows[i][colIdx];
                if (v !== undefined && v !== null && String(v).trim() !== "") {
                    values.add(String(v).trim());
                }
            }
            return Array.from(values).sort((a, b) => a.localeCompare(b, 'vi'));
        }

        function buildDatalistOptions(values) {
            return values.map(v => `<option value="${String(v).replace(/"/g, '&quot;')}">`).join('');
        }

        // --- THÊM THIẾT BỊ MỚI: CHÈN DÒNG MỚI VÀO DỮ LIỆU EXCEL ---

        function openAddDeviceModal() {
            if (currentFileIdx === -1) {
                alert("Vui lòng nạp (hoặc chọn) một tệp dữ liệu trước khi thêm thiết bị mới!");
                return;
            }
            const file = loadedFiles[currentFileIdx];
            const struct = analyzeStructure(file.rows);

            const areaOptions = buildDatalistOptions(getUniqueColumnValues(struct, 'area'));
            const mainGroupOptions = buildDatalistOptions(getUniqueColumnValues(struct, 'mainGroup'));
            const subGroupOptions = buildDatalistOptions(getUniqueColumnValues(struct, 'subGroup'));
            const cabinetOptions = buildDatalistOptions(getUniqueColumnValues(struct, 'cabinet'));

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'addDeviceModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 620px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <span class="modal-title">➕ Thêm Thiết Bị Mới</span>
                        <button class="close-modal" onclick="closeAddDeviceModal()">✖</button>
                    </div>
                    <form id="addDeviceForm" onsubmit="saveNewDevice(event)" style="display: flex; flex-direction: column; gap: 12px; font-size: 0.85rem;">

                        <h4 style="color: var(--color-sky); margin-bottom: -5px;">Vị trí trong sơ đồ cây</h4>
                        <div style="display: flex; gap: 10px;">
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Khu vực (Area):</label>
                                <input type="text" id="add_area" list="dl_area" class="search-input" placeholder="VD: MDF 2">
                                <datalist id="dl_area">${areaOptions}</datalist>
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Nhóm chính (Main Group):</label>
                                <input type="text" id="add_mainGroup" list="dl_mainGroup" class="search-input" placeholder="VD: Khu nghiền">
                                <datalist id="dl_mainGroup">${mainGroupOptions}</datalist>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Nhóm phụ (Sub Group):</label>
                                <input type="text" id="add_subGroup" list="dl_subGroup" class="search-input" placeholder="VD: Băng tải">
                                <datalist id="dl_subGroup">${subGroupOptions}</datalist>
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Tủ điện (Cabinet):</label>
                                <input type="text" id="add_cabinet" list="dl_cabinet" class="search-input" placeholder="VD: Tủ MCC-01">
                                <datalist id="dl_cabinet">${cabinetOptions}</datalist>
                            </div>
                        </div>

                        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 5px 0;">
                        <h4 style="color: var(--color-sky); margin-bottom: -5px;">Thông tin thiết bị</h4>

                        <div style="display: flex; gap: 10px;">
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Mã thiết bị:</label>
                                <input type="text" id="add_item" class="search-input" required>
                            </div>
                            <div style="flex: 2;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Chức năng (Tên):</label>
                                <input type="text" id="add_name" class="search-input">
                            </div>
                        </div>

                        <div style="display: flex; gap: 10px;">
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Model:</label>
                                <input type="text" id="add_model" class="search-input">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Kiểu khởi động:</label>
                                <input type="text" id="add_startingType" class="search-input">
                            </div>
                        </div>

                        <div style="display: flex; gap: 10px;">
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Công suất (kW):</label>
                                <input type="text" id="add_power" class="search-input">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Dòng điện In (A):</label>
                                <input type="text" id="add_current" class="search-input">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold; margin-bottom: 3px;">Tốc độ (rpm):</label>
                                <input type="text" id="add_speed" class="search-input">
                            </div>
                        </div>

                        <div>
                            <label style="display: block; font-weight: bold; margin-bottom: 3px;">Mức độ quan trọng:</label>
                            <select id="add_rate" class="search-input">
                                <option value="0">Chưa đánh giá</option>
                                <option value="1">★ Ít quan trọng</option>
                                <option value="2">★★ Quan trọng</option>
                                <option value="3">★★★ Rất quan trọng</option>
                            </select>
                        </div>

                        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 5px 0;">
                        <h4 style="color: var(--color-sky); margin-bottom: 5px;">Chu kỳ & Nội dung công việc (bỏ trống nếu chưa có)</h4>

                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <div style="width: 100px;">
                                <label style="display: block; font-weight: bold;">Ngày:</label>
                                <input type="number" id="add_day" class="search-input" style="margin-top:3px;">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold;">Công việc chu kỳ Ngày:</label>
                                <textarea id="add_jobday" class="search-input" rows="2" style="margin-top:3px; resize: vertical; font-family: inherit;"></textarea>
                            </div>
                        </div>

                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <div style="width: 100px;">
                                <label style="display: block; font-weight: bold;">Tháng:</label>
                                <input type="number" id="add_month" class="search-input" style="margin-top:3px;">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold;">Công việc chu kỳ Tháng:</label>
                                <textarea id="add_jobmonth" class="search-input" rows="2" style="margin-top:3px; resize: vertical; font-family: inherit;"></textarea>
                            </div>
                        </div>

                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <div style="width: 100px;">
                                <label style="display: block; font-weight: bold;">Năm:</label>
                                <input type="number" id="add_year" class="search-input" style="margin-top:3px;">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; font-weight: bold;">Công việc chu kỳ Năm:</label>
                                <textarea id="add_jobyear" class="search-input" rows="2" style="margin-top:3px; resize: vertical; font-family: inherit;"></textarea>
                            </div>
                        </div>

                        <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-muted); margin-top: 5px;">
                            <input type="checkbox" id="add_continueAdding" style="width: auto;">
                            Sau khi lưu, giữ modal mở để tiếp tục thêm thiết bị khác (giữ nguyên Khu vực / Nhóm)
                        </label>

                        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                            <button type="button" class="btn btn-slate" onclick="closeAddDeviceModal()">Hủy</button>
                            <button type="submit" class="btn btn-emerald">➕ Thêm vào danh sách</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function closeAddDeviceModal() {
            const modal = document.getElementById('addDeviceModal');
            if (modal) modal.remove();
        }

        function saveNewDevice(event) {
            event.preventDefault();
            if (currentFileIdx === -1) return;

            const file = loadedFiles[currentFileIdx];
            const struct = analyzeStructure(file.rows);

            const itemVal = document.getElementById('add_item').value.trim();
            if (!itemVal) {
                alert("Vui lòng nhập Mã thiết bị!");
                return;
            }

            // Kiểm tra trùng mã thiết bị
            if (struct.item !== -1) {
                for (let i = struct.headerRowIdx + 1; i < file.rows.length; i++) {
                    const existing = file.rows[i][struct.item];
                    if (existing && String(existing).trim().toLowerCase() === itemVal.toLowerCase()) {
                        alert(`Mã thiết bị "${itemVal}" đã tồn tại trong danh sách! Vui lòng dùng mã khác.`);
                        return;
                    }
                }
            }

            const areaVal = document.getElementById('add_area').value.trim();
            const mainGroupVal = document.getElementById('add_mainGroup').value.trim();
            const subGroupVal = document.getElementById('add_subGroup').value.trim();
            const cabinetVal = document.getElementById('add_cabinet').value.trim();
            const nameVal = document.getElementById('add_name').value.trim();
            const modelVal = document.getElementById('add_model').value.trim();
            const startingTypeVal = document.getElementById('add_startingType').value.trim();
            const powerVal = document.getElementById('add_power').value.trim();
            const currentVal = document.getElementById('add_current').value.trim();
            const speedVal = document.getElementById('add_speed').value.trim();
            const rateVal = document.getElementById('add_rate').value;
            const dayVal = document.getElementById('add_day').value;
            const jobdayVal = document.getElementById('add_jobday').value;
            const monthVal = document.getElementById('add_month').value;
            const jobmonthVal = document.getElementById('add_jobmonth').value;
            const yearVal = document.getElementById('add_year').value;
            const jobyearVal = document.getElementById('add_jobyear').value;

            // Tạo dòng dữ liệu mới, đủ số cột như phần còn lại của bảng
            const newRow = new Array(struct.headers.length).fill("");
            newRow[struct.rate] = rateVal;
            if (struct.area !== -1) newRow[struct.area] = areaVal;
            if (struct.mainGroup !== -1) newRow[struct.mainGroup] = mainGroupVal;
            if (struct.subGroup !== -1) newRow[struct.subGroup] = subGroupVal;
            if (struct.cabinet !== -1) newRow[struct.cabinet] = cabinetVal;
            if (struct.item !== -1) newRow[struct.item] = itemVal;
            if (struct.name !== -1) newRow[struct.name] = nameVal;
            if (struct.model !== -1) newRow[struct.model] = modelVal;
            if (struct.startingType !== -1) newRow[struct.startingType] = startingTypeVal;
            if (struct.power !== -1) newRow[struct.power] = powerVal;
            if (struct.current !== -1) newRow[struct.current] = currentVal;
            if (struct.speed !== -1) newRow[struct.speed] = speedVal;
            if (struct.day !== -1) newRow[struct.day] = dayVal;
            if (struct.jobday !== -1) newRow[struct.jobday] = jobdayVal;
            if (struct.month !== -1) newRow[struct.month] = monthVal;
            if (struct.jobmonth !== -1) newRow[struct.jobmonth] = jobmonthVal;
            if (struct.year !== -1) newRow[struct.year] = yearVal;
            if (struct.jobyear !== -1) newRow[struct.jobyear] = jobyearVal;

            // Chèn dòng mới vào ngay sau dòng tiêu đề (đầu danh sách thiết bị)
            file.rows.splice(struct.headerRowIdx + 1, 0, newRow);

            setUnsavedFlag(true);
            processDataset();
            renderFileList();

            const keepOpen = document.getElementById('add_continueAdding').checked;
            if (keepOpen) {
                closeAddDeviceModal();
                openAddDeviceModal();
                // Giữ lại Khu vực / Nhóm chính / Nhóm phụ / Tủ điện để nhập nhanh thiết bị tiếp theo
                document.getElementById('add_area').value = areaVal;
                document.getElementById('add_mainGroup').value = mainGroupVal;
                document.getElementById('add_subGroup').value = subGroupVal;
                document.getElementById('add_cabinet').value = cabinetVal;
                document.getElementById('add_continueAdding').checked = true;
                document.getElementById('add_item').focus();
            } else {
                closeAddDeviceModal();
                alert(`Đã thêm thiết bị "${itemVal}" vào danh sách! Hãy bấm "💾 Lưu dữ liệu" ở khung "Quản lý dữ liệu" để ghi trực tiếp vào file Excel.`);
            }
        }

        // --- BIỂU DIỄN SƠ ĐỒ CÂY ---
        function renderDeviceTree() {
            if (currentFileIdx === -1) return;
            const searchVal = searchInput.value.toLowerCase().trim();
            const importanceFilterVal = filterImportance ? filterImportance.value : 'all';

            const filteredRows = allValidRows.filter(row => {
                const matchSearch = searchVal === "" ||
                       row.item.toLowerCase().includes(searchVal) || 
                       row.name.toLowerCase().includes(searchVal) || 
                       row.model.toLowerCase().includes(searchVal) ||
                       row.cabinet.toLowerCase().includes(searchVal) ||
                       row.mainGroup.toLowerCase().includes(searchVal);
                if (!matchSearch) return false;

                if (importanceFilterVal !== 'all') {
                    const lvl = row.rate;
                    if (String(lvl) !== importanceFilterVal) return false;
                }
                return true;
            });

            if (filteredRows.length === 0) {
                treeContainer.innerHTML = `<div class="italic text-center p-20" style="color: var(--text-muted);">Không tìm thấy thiết bị nào phù hợp.</div>`;
                return;
            }

            const treeData = {};
            filteredRows.forEach(row => {
                const area = row.area || "CHUNG";
                const main = row.mainGroup || "Nhóm lớn chung";
                const sub = row.subGroup || "Nhóm phụ chung";
                const cabinet = row.cabinet || "Không có tủ";

                if (!treeData[area]) treeData[area] = {};
                if (!treeData[area][main]) treeData[area][main] = {};
                if (!treeData[area][main][sub]) treeData[area][main][sub] = {};
                if (!treeData[area][main][sub][cabinet]) treeData[area][main][sub][cabinet] = [];

                treeData[area][main][sub][cabinet].push(row);
            });

            let treeHtml = `<ul class="tree-ul">`;

            for (const area in treeData) {
                const areaPath = `area_${area}`;
                const isAreaExpanded = expandedNodes.has(areaPath);
                const areaCollapsedClass = isAreaExpanded ? '' : 'collapsed';
                const areaIcon = isAreaExpanded ? '[-]' : '[+]';

                treeHtml += `
                    <li class="tree-li">
                        <div class="tree-node-header area-node" onclick="toggleTreeNode(this, '${areaPath}')">
                            <span class="tree-toggle-icon">${areaIcon}</span> ${area}
                        </div>
                        <div class="tree-children ${areaCollapsedClass}">
                            <ul class="tree-ul">`;

                for (const main in treeData[area]) {
                    const mainPath = `${areaPath}_main_${main}`;
                    const isMainExpanded = expandedNodes.has(mainPath);
                    const mainCollapsedClass = isMainExpanded ? '' : 'collapsed';
                    const mainIcon = isMainExpanded ? '[-]' : '[+]';

                    treeHtml += `
                        <li class="tree-li">
                            <div class="tree-node-header" onclick="toggleTreeNode(this, '${mainPath}')" style="color: var(--color-sky);">
                                <span class="tree-toggle-icon">${mainIcon}</span> ${main}
                            </div>
                            <div class="tree-children ${mainCollapsedClass}">
                                <ul class="tree-ul">`;

                    for (const sub in treeData[area][main]) {
                        const subPath = `${mainPath}_sub_${sub}`;
                        const isSubExpanded = expandedNodes.has(subPath);
                        const subCollapsedClass = isSubExpanded ? '' : 'collapsed';
                        const subIcon = isSubExpanded ? '[-]' : '[+]';

                        treeHtml += `
                            <li class="tree-li">
                                <div class="tree-node-header" onclick="toggleTreeNode(this, '${subPath}')" style="color: var(--color-amber);">
                                    <span class="tree-toggle-icon">${subIcon}</span> ${sub}
                                </div>
                                <div class="tree-children ${subCollapsedClass}">
                                    <ul class="tree-ul">`;

                        for (const cabinet in treeData[area][main][sub]) {
                            const cabPath = `${subPath}_cab_${cabinet}`;
                            const isCabExpanded = expandedNodes.has(cabPath);
                            const cabCollapsedClass = isCabExpanded ? '' : 'collapsed';
                            const cabIcon = isCabExpanded ? '[-]' : '[+]';

                            treeHtml += `
                                <li class="tree-li">
                                    <div class="tree-node-header" onclick="toggleTreeNode(this, '${cabPath}')" style="color: #cbd5e1; font-style: italic;">
                                        <span class="tree-toggle-icon">${cabIcon}</span> Tủ: ${cabinet}
                                    </div>
                                    <div class="tree-children ${cabCollapsedClass}">
                                        <ul class="tree-ul">`;

                            treeData[area][main][sub][cabinet].forEach(device => {
                                const nextDay = calculateNextDate(device.lastMaintDay, device.day, 'day');
                                const nextMonth = calculateNextDate(device.lastMaintMonth, device.month, 'month');
                                const nextYear = calculateNextDate(device.lastMaintYear, device.year, 'year');

                                const dayCls = getDateStatusClass(nextDay);
                                const monthCls = getDateStatusClass(nextMonth);
                                const yearCls = getDateStatusClass(nextYear);

                                const importanceLvl = device.rate;

                                treeHtml += `
                                    <li class="tree-li">
                                        <div class="device-card importance-${importanceLvl}">
                                            
                                            <div class="comp-section comp-left">
                                                <div style="display: flex; justify-content: flex-end; align-items: center; width:100%; gap: 6px;">
                                                    <button class="btn-edit" onclick="openDeviceLogModal(${device.rowIdx})">📜 Nhật ký</button>
                                                    <button class="btn-edit" onclick="openDeviceQrModal(${device.rowIdx})" title="Tạo mã QR tra cứu nhanh lịch sử bảo trì">📱 QR</button>
                                                    <button class="btn-edit" onclick="openEditModal(${device.rowIdx})">✏️ Sửa</button>
                                                </div>
                                                <div style="margin-top:2px;">
                                                    <span class="device-code">${device.item}</span>
                                                    <div class="device-name">${device.name}</div>
                                                    ${device.model ? `<div class="device-model">Model: ${device.model}</div>` : ''}
                                                </div>
                                                <div class="device-tech">
                                                    ${device.power ? `<span class="tech-badge">P: ${device.power} kW</span>` : ''}
                                                    ${device.current ? `<span class="tech-badge">In: ${device.current} A</span>` : ''}
                                                    ${device.speed ? `<span class="tech-badge">N: ${device.speed} rpm</span>` : ''}
                                                    ${device.startingType ? `<span class="tech-badge">Khởi động: ${device.startingType}</span>` : ''}
                                                </div>
                                                <div class="importance-row">
                                                    <div class="importance-stars lvl-${importanceLvl}" title="Nhấp vào sao để đánh dấu mức độ quan trọng">
                                                        <span class="star ${importanceLvl >= 1 ? 'active' : ''}" title="Ít quan trọng (*)" onclick="setDeviceImportance(${device.rowIdx}, 1, event)">★</span>
                                                        <span class="star ${importanceLvl >= 2 ? 'active' : ''}" title="Quan trọng (**)" onclick="setDeviceImportance(${device.rowIdx}, 2, event)">★</span>
                                                        <span class="star ${importanceLvl >= 3 ? 'active' : ''}" title="Rất quan trọng (***)" onclick="setDeviceImportance(${device.rowIdx}, 3, event)">★</span>
                                                    </div>
                                                    <span class="importance-label lvl-${importanceLvl}">${getImportanceLabel(importanceLvl)}</span>
                                                </div>
                                            </div>
                                            
                                            <div class="comp-section comp-middle">
                                                <div class="comp-title" style="display:flex; justify-content:space-between; align-items:center;">
                                                    <span>📋 Kế hoạch bảo trì</span>
                                                    <button onclick="promptAddAdhoc(${device.rowIdx})" class="btn-trigger-compact" style="color: var(--color-violet); border-color: rgba(168,85,247,0.4);" title="Thêm vào kế hoạch bảo trì đột xuất">🔧 Đột xuất</button>
                                                </div>
                                                <div class="plan-rows-container">
                                                    <div class="align-row ${dayCls === 'overdue' ? 'is-overdue' : ''}">
                                                        ${device.day ? `
                                                        <button onclick="addToPlan(${device.rowIdx}, 'day')" class="btn-trigger-compact">Ngày (${device.day}d)</button>
                                                        <span class="next-plan-date-large ${dayCls}">${nextDay}</span>
                                                        ` : '<div class="empty-row-placeholder"></div>'}
                                                    </div>
                                                    
                                                    <div class="align-row ${monthCls === 'overdue' ? 'is-overdue' : ''}">
                                                        ${device.month ? `
                                                        <button onclick="addToPlan(${device.rowIdx}, 'month')" class="btn-trigger-compact">Tháng (${device.month}m)</button>
                                                        <span class="next-plan-date-large ${monthCls}">${nextMonth}</span>
                                                        ` : '<div class="empty-row-placeholder"></div>'}
                                                    </div>
                                                    
                                                    <div class="align-row ${yearCls === 'overdue' ? 'is-overdue' : ''}">
                                                        ${device.year ? `
                                                        <button onclick="addToPlan(${device.rowIdx}, 'year')" class="btn-trigger-compact">Năm (${device.year}y)</button>
                                                        <span class="next-plan-date-large ${yearCls}">${nextYear}</span>
                                                        ` : '<div class="empty-row-placeholder"></div>'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="comp-section comp-right">
                                                <div class="comp-title">⏳ Lịch sử bảo trì</div>
                                                <div class="plan-rows-container">
                                                    <div class="align-row justify-between">
                                                        ${device.day ? `
                                                        <span class="history-label">Ngày:</span>
                                                        <div class="history-val-box">
                                                            <span class="history-val-text">${device.lastMaintDay || 'Chưa có'}</span>
                                                            <button class="btn-trend" onclick="showTrend('${device.item}', 'Ngày', '${device.historyDay.replace(/'/g, "\\'")}')">📊</button>
                                                        </div>
                                                        ` : '<div class="empty-row-placeholder"></div>'}
                                                    </div>

                                                    <div class="align-row justify-between">
                                                        ${device.month ? `
                                                        <span class="history-label">Tháng:</span>
                                                        <div class="history-val-box">
                                                            <span class="history-val-text">${device.lastMaintMonth || 'Chưa có'}</span>
                                                            <button class="btn-trend" onclick="showTrend('${device.item}', 'Tháng', '${device.historyMonth.replace(/'/g, "\\'")}')">📊</button>
                                                        </div>
                                                        ` : '<div class="empty-row-placeholder"></div>'}
                                                    </div>

                                                    <div class="align-row justify-between">
                                                        ${device.year ? `
                                                        <span class="history-label">Năm:</span>
                                                        <div class="history-val-box">
                                                            <span class="history-val-text">${device.lastMaintYear || 'Chưa có'}</span>
                                                            <button class="btn-trend" onclick="showTrend('${device.item}', 'Năm', '${device.historyYear.replace(/'/g, "\\'")}')">📊</button>
                                                        </div>
                                                        ` : '<div class="empty-row-placeholder"></div>'}
                                                    </div>
                                                </div>
                                            </div>

                                        </div>
                                    </li>
                                `;
                            });

                            treeHtml += `</ul></div></li>`;
                        }
                        treeHtml += `</ul></div></li>`;
                    }
                    treeHtml += `</ul></div></li>`;
                }
                treeHtml += `</ul></div></li>`;
            }
            treeHtml += `</ul>`;
            treeContainer.innerHTML = treeHtml;
        }

        function toggleTreeNode(element, nodePath) {
            const childrenContainer = element.nextElementSibling;
            const icon = element.querySelector('.tree-toggle-icon');
            if (childrenContainer) {
                const isCollapsed = childrenContainer.classList.toggle('collapsed');
                icon.innerText = isCollapsed ? '[+]' : '[-]';
                
                if (!isCollapsed) {
                    expandedNodes.add(nodePath);
                } else {
                    expandedNodes.delete(nodePath);
                }
            }
        }

        // --- HIỂN THỊ HỘP THOẠI LỊCH SỬ CHU KỲ & TẦN SUẤT ---
        function calculateIntervalInDays(dateStr1, dateStr2) {
            if (!dateStr1 || !dateStr2) return "";
            try {
                const parseDate = (str) => {
                    const clean = str.split(' ')[0].trim(); 
                    if (clean.includes('-')) {
                        const parts = clean.split('-');
                        if (parts[0].length === 4) return new Date(parts[0], parts[1]-1, parts[2]); 
                        return new Date(parts[2], parts[1]-1, parts[0]); 
                    } else if (clean.includes('/')) {
                        const parts = clean.split('/');
                        if (parts[2].length === 4) return new Date(parts[2], parts[1]-1, parts[0]); 
                        return new Date(parts[0], parts[1]-1, parts[2]); 
                    }
                    return new Date(clean);
                };

                const d1 = parseDate(dateStr1);
                const d2 = parseDate(dateStr2);

                if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return "";

                const diffTime = Math.abs(d1 - d2);
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                return `${diffDays}d`;
            } catch(e) {
                return "";
            }
        }

        function showTrend(itemName, cycleType, historyStr) {
            const dates = historyStr ? historyStr.split(',').map(d => d.trim()).filter(d => d !== '') : [];
            const recentDates = dates.slice(0, 5); 
            
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'trendModal';
            
            let timelineHtml = '';
            if (recentDates.length === 0) {
                timelineHtml = '<div class="italic text-center" style="color: var(--text-muted); padding: 15px 0;">Chưa ghi nhận lịch sử bảo trì.</div>';
            } else {
                timelineHtml = '<div class="timeline-container">';
                recentDates.forEach((d, idx) => {
                    const isLatest = idx === 0;
                    let intervalText = "";
                    if (idx < recentDates.length - 1) {
                        const daysDiff = calculateIntervalInDays(d, recentDates[idx + 1]);
                        if (daysDiff) {
                            intervalText = `<span style="font-size:0.75rem; color: var(--color-amber); font-weight:bold; margin-left: 10px;">➔ Tần suất: ${daysDiff}</span>`;
                        }
                    }
                    timelineHtml += `
                        <div class="timeline-node ${isLatest ? 'latest' : ''}">
                            <div class="timeline-node-card">
                                <div style="display: flex; flex-direction: column;">
                                    <span style="font-size:0.72rem; color: ${isLatest ? 'var(--color-sky)' : 'var(--text-muted)'}; font-weight: bold;">
                                        ${isLatest ? 'Mới nhất (Lần ' + (dates.length - idx) + ')' : 'Lần ' + (dates.length - idx)}
                                    </span>
                                    <span style="font-size:0.8rem; font-weight:bold; color:var(--text-main); margin-top:2px;">${d}</span>
                                </div>
                                ${intervalText}
                            </div>
                        </div>
                    `;
                });
                timelineHtml += '</div>';
            }

            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <span class="modal-title">📊 Lịch sử bảo trì ${cycleType.toUpperCase()}</span>
                        <button class="close-modal" onclick="closeTrendModal()">✖</button>
                    </div>
                    <div style="margin-bottom: 12px; font-size: 0.85rem;">
                        Thiết bị: <strong style="color: white; font-size:0.95rem;">${itemName}</strong>
                    </div>
                    ${timelineHtml}
                </div>
            `;
            document.body.appendChild(modal);
        }

        function closeTrendModal() {
            const modal = document.getElementById('trendModal');
            if (modal) modal.remove();
        }

        // --- QUẢN LÝ DANH SÁCH KẾ HOẠCH ---

        async function saveAndOverwriteFile() {
            if (currentFileIdx === -1) return;
            const fileObj = loadedFiles[currentFileIdx];

            const newWorksheet = XLSX.utils.aoa_to_sheet(fileObj.rows);
            fileObj.workbook.Sheets[fileObj.sheetName] = newWorksheet;
            const wbout = XLSX.write(fileObj.workbook, { bookType: 'xlsx', type: 'array' });

            if (fileObj.driveFileId) {
                try {
                    await driveUploadFile(driveDataFolderId, fileObj.name, wbout, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileObj.driveFileId);
                    setUnsavedFlag(false);
                    alert(`Đã lưu dữ liệu thành công lên Google Drive:\n"${fileObj.name}"!`);
                } catch (err) {
                    alert("Lỗi khi lưu lên Google Drive: " + err.message + "\nDữ liệu vẫn được giữ tại đây, vui lòng thử lưu lại.");
                }
                return;
            }

            if (fileObj.handle) {
                try {
                    const options = { mode: 'readwrite' };
                    if (await fileObj.handle.queryPermission(options) !== 'granted') {
                        if (await fileObj.handle.requestPermission(options) !== 'granted') {
                            alert("Ứng dụng bị từ chối quyền ghi đè. Sẽ tự chuyển sang chế độ tải file mới về!");
                            downloadFallback(fileObj, wbout);
                            return;
                        }
                    }
                    const writable = await fileObj.handle.createWritable();
                    await writable.write(wbout);
                    await writable.close();
                    
                    setUnsavedFlag(false);
                    alert(`Đã lưu dữ liệu thành công trực tiếp vào file nguồn:\n"${fileObj.name}"!`);
                } catch (err) {
                    console.warn("Lỗi ghi đè trực tiếp:", err.message);
                    downloadFallback(fileObj, wbout);
                }
            } else {
                downloadFallback(fileObj, wbout);
            }
        }

        function downloadFallback(fileObj, wbout) {
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileObj.name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            setUnsavedFlag(false);
            alert(`Hệ thống đã tự động tải về file mới đã chỉnh sửa: "${fileObj.name}"`);
        }

