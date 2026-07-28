        // --- BIẾN TOÀN CỤC ---
        let loadedFiles = [];
        let currentFileIdx = -1;
        let allValidRows = [];
        let maintPlan = [];
        let hasUnsavedChanges = false;
        let expandedNodes = new Set(); // Bộ nhớ lưu nhánh mở
        let currentMainTab = 'welcome';
        // Đọc tham số ?goto=... và ?assignee=... trên URL (dùng khi quét mã QR "Việc ngày" — mở thẳng đúng tab, khoá lọc theo đúng người)
        let pendingGotoTab = new URLSearchParams(location.search).get('goto');
        let pendingAssigneeFilter = new URLSearchParams(location.search).get('assignee') || null;
        let hasLoadedDataOnce = false;
        let deviceLogs = {}; // { "MÃ_THIẾT_BỊ": [ {id, performedAt, cycleType, cycleLabel, jobText, materials, performedBy, checkedBy, result, downtimeMinutes, notes, recordedAt} ] }
        let logDirHandle = null;
        let technicianDirHandle = null; // Thư mục 'technician' tự động tìm/tạo để lưu file nhan_su.csv

        // --- CẤU HÌNH ONLINE: GOOGLE DRIVE & GEMINI AI ---
        // Client ID KHÔNG phải bí mật (khác Client Secret) nên khoá cứng thẳng ở đây là an toàn.
        // Chỉ cần tạo 1 lần trong Google Cloud Console, dùng chung cho mọi máy — không phải nhập tay nữa.
        const DRIVE_OAUTH_CLIENT_ID = '394414298854-16en7ouj69knsnuf0o2u3bblq4fr4aao.apps.googleusercontent.com';

        // Danh sách các thư mục dự án trên Google Drive để chọn nhanh (không cần gõ tay Folder ID).
        // Muốn thêm/sửa dự án: chỉnh mảng này rồi lưu lại file, phát cho các máy khác dùng chung.
        const DRIVE_PROJECT_FOLDERS = [
            { name: 'MDF1_CMMS', folderId: '149RgZoNMcu8JpNgoGZBv3o9Gtb_h6OUm' },
            { name: 'MDF2_CMMS', folderId: '1ITnIoWlNfe5RrLn5qyejRh9DAiH5OEth' }
        ];

        let appMode = 'local'; // 'local' | 'drive' — quyết định nơi đọc/ghi dữ liệu (ổ cứng cục bộ hay Google Drive)
        let driveClientId = DRIVE_OAUTH_CLIENT_ID;
        let driveFolderId = '';
        let driveAccessToken = ''; // Token OAuth, chỉ tồn tại trong phiên làm việc hiện tại (không lưu lại vì lý do bảo mật)
        let driveTokenClient = null;
        let driveUserEmail = '';
        let driveUserName = '';
        let driveActiveFolderId = ''; // Folder ID đã kích hoạt thành công (khác với driveFolderId đang chọn ở dropdown)
        let driveDataFolderId = '';
        let driveLogFolderId = '';
        let driveTechnicianFolderId = '';
        let driveMaintPlanFolderId = '';
        let driveAdhocPlanFolderId = '';
        let driveAdhocCampaignFolderId = '';
        let driveCompanyInfoFolderId = '';
        let driveRcaFolderId = '';
        let driveWorkOrdersFolderId = '';
        let driveFmeaFolderId = '';
        let geminiApiKey = '';
        // Danh sách model Gemini 3.x để tự động dò — model nào gọi API thành công trước sẽ được dùng.
        // Cập nhật danh sách này khi Google phát hành model mới hoặc ngừng hỗ trợ model cũ.
        const GEMINI_CANDIDATE_MODELS = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-3.5-flash', 'gemini-3.6-flash'];
        let geminiModelMode = 'auto'; // 'auto' = tự dò model khả dụng | hoặc tên 1 model cụ thể do người dùng chọn tay
        let geminiModel = 'gemini-3-flash-preview'; // Model đang thực sự dùng để gọi API (được cập nhật khi dò tự động)
        let chatbotHistory = []; // [{role: 'user'|'model', text: '...'}]

        let adhocPlan = []; // Kế hoạch bảo trì đột xuất (không theo chu kỳ ngày/tháng/năm)
        let currentPlanSubtab = 'cyclic';
        let adhocStatusFilter = 'all'; // Mục 12: lọc theo trạng thái (all/unscheduled/in_progress/waiting_materials)
        let adhocDateRangeFilterActive = false; // Mục 2: chỉ ẩn việc đã lên lịch ngoài khung ngày khi người dùng bấm "Lọc theo khung ngày"
        let logFolderPromptDeclined = false;
        let adhocCampaign = { startDate: '', endDate: '' }; // Ngày bắt đầu/kết thúc đợt bảo trì đột xuất hiện tại
        let selectedAdhocTaskId = null; // planId của công việc đang được chọn để gán khung giờ trên timeline
        let adhocCampaignHistory = []; // Lịch sử các đợt bảo trì đột xuất đã hoàn thành
        let personnelList = []; // Danh sách nhân sự { id, name, position, department }
        let rcaRecords = {}; // { "MÃ_THIẾT_BỊ": [ {id, item, name, area, mainGroup, subGroup, cabinet, sourceType, sourceLabel, problemDate, reportedBy, problemDescription, impact, fiveWhys[5], ishikawa{}, rootCause, rootCauseCategory, correctiveActions[], verification, status, createdAt, updatedAt, completedAt} ] }
        let rcaEditingRecord = null; // Bản sao đang chỉnh sửa trong trình soạn thảo RCA
        let rcaStatusFilter = 'all';
        let workOrders = {}; // { "YYYY-MM-DD": [ {id, title, device, deviceName, type, shift, assignee, priority, estHours, description, status, startedAt, completedAt, actualHours, notes, completionNotes, source, createdAt} ] }
        let woCurrentDate = '';  // "YYYY-MM-DD"
        let woSelectedId = null;

        // DOM elements
        const btnToggleSidebar = document.getElementById('btnToggleSidebar');
        const fileSidebar = document.getElementById('fileSidebar');
        const excelFiles = document.getElementById('excelFiles');
        const fileListContainer = document.getElementById('fileListContainer');
        const btnSaveFile = document.getElementById('btnSaveFile');
        const unsavedIndicator = document.getElementById('unsavedIndicator');
        const treeContainer = document.getElementById('treeContainer');
        const searchInput = document.getElementById('searchInput');
        const planContainer = document.getElementById('planContainer');
        const btnCompleteAll = document.getElementById('btnCompleteAll');
        const btnPrintPlan = document.getElementById('btnPrintPlan');
        const deviceCount = document.getElementById('deviceCount');
        const sidebarBackdrop = document.getElementById('sidebarBackdrop');
        const filterImportance = document.getElementById('filterImportance');
        const logDirStatus = document.getElementById('logDirStatus');
        const btnSummaryReport = document.getElementById('btnSummaryReport');
        const adhocPlanContainer = document.getElementById('adhocPlanContainer');
        const planSection = document.getElementById('planSection');
        const treeSection = document.getElementById('treeSection');

        function setUnsavedFlag(val) {
            hasUnsavedChanges = val;
            if (unsavedIndicator) unsavedIndicator.classList.toggle('hidden', !val);
        }

        // Gán sự kiện
        function openSidebar() {
            fileSidebar.classList.remove('collapsed');
            sidebarBackdrop.classList.add('show');
        }
        function closeSidebar() {
            fileSidebar.classList.add('collapsed');
            sidebarBackdrop.classList.remove('show');
        }

        // --- MENU DI ĐỘNG (☰) — chỉ hoạt động trên màn hình hẹp (điện thoại/iPad), CSS ẩn nút này trên desktop ---
        function toggleMobileNav() {
            document.getElementById('iconSidebar')?.classList.toggle('mobile-open');
            document.getElementById('mobileNavBackdrop')?.classList.toggle('show');
        }
        function closeMobileNav() {
            document.getElementById('iconSidebar')?.classList.remove('mobile-open');
            document.getElementById('mobileNavBackdrop')?.classList.remove('show');
        }
        btnToggleSidebar.addEventListener('click', () => {
            closeMobileNav();
            if (fileSidebar.classList.contains('collapsed')) openSidebar();
            else closeSidebar();
        });
        sidebarBackdrop.addEventListener('click', closeSidebar);
        excelFiles.addEventListener('change', handleExcelUploadLegacy);
        searchInput.addEventListener('input', renderDeviceTree);
        filterImportance.addEventListener('change', renderDeviceTree);
        btnSummaryReport?.addEventListener('click', () => { closeMobileNav(); closeSidebar(); openSummaryReportModal(); });
        btnSaveFile.addEventListener('click', saveAndOverwriteFile);
        btnCompleteAll.addEventListener('click', () => {
            if (currentPlanSubtab === 'adhoc') completeAllAdhocPlan();
            else completeAllPlan();
        });
        btnPrintPlan.addEventListener('click', () => {
            if (currentPlanSubtab === 'adhoc') printAdhocMaintenancePlan();
            else printMaintenancePlan();
        });

        // --- CHUYỂN TAB CHÍNH (WELCOME / DASHBOARD / THIẾT BỊ / NHÂN SỰ) ---
        function switchMainTab(tab) {
            closeMobileNav();
            closeSidebar();
            currentMainTab = tab;
            ['welcome','dashboard','device','personnel','plan','rca','fmea','workorder','config'].forEach(t => {
                const el = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
                if (el) el.classList.toggle('active', t === tab);
            });
            document.getElementById('navBtnDashboard').classList.toggle('active', tab === 'dashboard');
            document.getElementById('navBtnDevice').classList.toggle('active', tab === 'device');
            document.getElementById('navBtnPersonnel').classList.toggle('active', tab === 'personnel');
            document.getElementById('navBtnPlan').classList.toggle('active', tab === 'plan');
            document.getElementById('navBtnRCA').classList.toggle('active', tab === 'rca');
            document.getElementById('navBtnFmea')?.classList.toggle('active', tab === 'fmea');
            document.getElementById('navBtnWorkOrder').classList.toggle('active', tab === 'workorder');
            document.getElementById('navBtnConfig')?.classList.toggle('active', tab === 'config');
            if (tab === 'dashboard') renderDashboard();
            if (tab === 'personnel') renderPersonnelPage();
            if (tab === 'plan') { renderMaintPlan(); renderAdhocPlan(); renderAdhocTimelineSection(); }
            if (tab === 'rca') { closeRcaEditor(); renderRcaList(); }
            if (tab === 'fmea') { closeFmeaEditor(); renderFmeaList(); }
            if (tab === 'workorder') { initWorkOrderTab(); }
            if (tab === 'config') renderCfgCompanyInfoPreview();
        }

        // --- KHỞI CHẠY ỨNG DỤNG & PHỤC HỒI ---
        window.addEventListener('DOMContentLoaded', async () => {
            updateMainHeaderTitle();
            loadAppConfigFromStorage();
            updateHeaderUserStatus();
            loadPlanFromLocalStorage();
            loadDeviceLogsFromStorage();
            loadAdhocPlanFromLocalStorage();
            loadPersonnelFromStorage();
            loadWorkOrdersFromStorage();
            loadAdhocCampaignFromLocalStorage();
            loadAdhocCampaignHistory();
            loadRcaRecordsFromStorage();
            loadFmeaRecordsFromStorage();
            renderAdhocTimelineSection();
            try {
                const savedProject = await getProjectDirHandleFromDB();
                if (savedProject && savedProject.handle) {
                    renderProjectQuickActivation(savedProject.handle);
                }
            } catch (e) {
                console.error("Lỗi khởi tạo IndexedDB:", e);
            }
            try {
                await tryRestoreLogDirHandle();
            } catch (e) {
                console.error("Lỗi khôi phục thư mục nhật ký:", e);
            }
            try {
                await tryRestoreTechnicianDirHandle();
            } catch (e) {
                console.error("Lỗi khôi phục thư mục nhân sự:", e);
            }
            initPanelResizer();
            populateGateFolderSelect();

            // Nếu mở trang qua mã QR "Việc ngày" (?goto=workorder) — hiện rõ trên màn hình đăng nhập đầu tiên
            if (pendingGotoTab === 'workorder') {
                const gateCard = document.querySelector('.auth-gate-card');
                if (gateCard) {
                    const banner = document.createElement('div');
                    banner.style.cssText = 'font-size:0.78rem; color:var(--color-violet); background:rgba(168,85,247,0.1); border:1px solid var(--color-violet); border-radius:8px; padding:10px; margin-bottom:16px;';
                    banner.innerHTML = pendingAssigneeFilter
                        ? `🔗 Đường dẫn công việc riêng của <strong>${pendingAssigneeFilter}</strong> — đăng nhập để xem danh sách của bạn.`
                        : `🔗 Đường dẫn chia sẻ tới danh sách <strong>Việc ngày</strong> — đăng nhập để tiếp tục.`;
                    gateCard.insertBefore(banner, gateCard.querySelector('h1'));
                }
            }
        });

        // --- KÉO GIÃN / THU NHỎ KHUNG SƠ ĐỒ THIẾT BỊ & KẾ HOẠCH BẢO DƯỠNG ---
        function initPanelResizer() {
            const resizer = document.getElementById('panelResizer');
            const treeSection = document.getElementById('treeSection');
            const planSection = document.getElementById('planMiniSection');
            const container = document.querySelector('#tabDevice .main-content');
            if (!resizer || !treeSection || !planSection || !container) return;

            // Khôi phục tỉ lệ khung đã lưu trước đó (nếu có)
            const savedRatio = parseFloat(localStorage.getItem('treePanelRatio'));
            if (!isNaN(savedRatio) && savedRatio > 10 && savedRatio < 90) {
                treeSection.style.width = savedRatio + '%';
                planSection.style.width = (100 - savedRatio) + '%';
            }

            let dragging = false;

            resizer.addEventListener('mousedown', (e) => {
                dragging = true;
                resizer.classList.add('resizing');
                document.body.classList.add('panel-resizing');
                e.preventDefault();
            });

            window.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                const rect = container.getBoundingClientRect();
                let treeWidthPx = e.clientX - rect.left;
                const resizerWidth = resizer.offsetWidth;
                let ratio = (treeWidthPx / (rect.width - resizerWidth)) * 100;
                // Giới hạn kích thước tối thiểu/tối đa để giao diện không bị vỡ
                ratio = Math.max(20, Math.min(80, ratio));
                treeSection.style.width = ratio + '%';
                planSection.style.width = (100 - ratio) + '%';
            });

            window.addEventListener('mouseup', () => {
                if (!dragging) return;
                dragging = false;
                resizer.classList.remove('resizing');
                document.body.classList.remove('panel-resizing');
                const rect = container.getBoundingClientRect();
                const ratio = (treeSection.getBoundingClientRect().width / (rect.width - resizer.offsetWidth)) * 100;
                localStorage.setItem('treePanelRatio', ratio.toFixed(2));
            });

            // Cho phép thao tác trên thiết bị cảm ứng (tablet)
            resizer.addEventListener('touchstart', () => {
                dragging = true;
                resizer.classList.add('resizing');
                document.body.classList.add('panel-resizing');
            }, { passive: true });
            window.addEventListener('touchmove', (e) => {
                if (!dragging || !e.touches[0]) return;
                const rect = container.getBoundingClientRect();
                let treeWidthPx = e.touches[0].clientX - rect.left;
                const resizerWidth = resizer.offsetWidth;
                let ratio = (treeWidthPx / (rect.width - resizerWidth)) * 100;
                ratio = Math.max(20, Math.min(80, ratio));
                treeSection.style.width = ratio + '%';
                planSection.style.width = (100 - ratio) + '%';
            }, { passive: true });
            window.addEventListener('touchend', () => {
                if (!dragging) return;
                dragging = false;
                resizer.classList.remove('resizing');
                document.body.classList.remove('panel-resizing');
                const rect = container.getBoundingClientRect();
                const ratio = (treeSection.getBoundingClientRect().width / (rect.width - resizer.offsetWidth)) * 100;
                localStorage.setItem('treePanelRatio', ratio.toFixed(2));
            });
        }

        window.addEventListener('beforeunload', (e) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'Bạn có thay đổi chưa lưu trên file Excel. Bạn có chắc chắn muốn thoát?';
            }
        });

        // --- INDEXEDDB: KHÔI PHỤC ĐƯỜNG DẪN FILE CŨ ---
        const dbName = "MDF_Maintenance_DB";
        const storeName = "FileHandles";

        function openDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(dbName, 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    db.createObjectStore(storeName, { keyPath: "id" });
                };
                request.onsuccess = (e) => resolve(e.target.result);
                request.onerror = (e) => reject(e.target.error);
            });
        }

        async function saveHandleToDB(handle) {
            try {
                const db = await openDB();
                const tx = db.transaction(storeName, "readwrite");
                const store = tx.objectStore(storeName);
                await store.put({ id: "last_file", handle: handle, name: handle.name });
            } catch (e) { /* Handle ảo (Google Drive) không thể lưu vào IndexedDB — bỏ qua an toàn */ }
        }

        async function getHandleFromDB() {
            const db = await openDB();
            return new Promise((resolve) => {
                const tx = db.transaction(storeName, "readonly");
                const store = tx.objectStore(storeName);
                const request = store.get("last_file");
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            });
        }

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
        function savePlanToLocalStorage() {
            localStorage.setItem('maintPlan', JSON.stringify(maintPlan));
            if (appMode === 'drive' && driveMaintPlanFolderId) driveSyncJsonFile(driveMaintPlanFolderId, 'maintPlan.json', maintPlan);
        }

        function loadPlanFromLocalStorage() {
            const stored = localStorage.getItem('maintPlan');
            if (stored) {
                try {
                    maintPlan = JSON.parse(stored);
                    renderMaintPlan();
                } catch (e) {
                    console.error("Lỗi khôi phục kế hoạch bảo trì:", e);
                }
            }
        }

        // --- LOCAL STORAGE: NHẬT KÝ BẢO TRÌ THIẾT BỊ (NGUỒN DỮ LIỆU GỐC, LUÔN CÓ SẴN) ---
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

        function buildAdhocPlanBackupCsv() {
            const header = ['STT', 'Khu vực', 'Mã TB', 'Tên TB', 'Nội dung công việc', 'Trạng thái', 'Ưu tiên', 'Người thực hiện', 'Chờ vật tư', 'Khung giờ đã chọn', 'Thêm lúc', 'DuLieuGoc(KhongXoa)'];
            const lines = [header.map(csvEscape).join(',')];
            adhocPlan.forEach((p, idx) => {
                const status = getAdhocJobStatus(p);
                lines.push([
                    idx + 1,
                    p.area || '',
                    p.item || '',
                    p.name || '',
                    p.jobText || '',
                    status.label,
                    getAdhocPriorityLabel(p.priority || 0),
                    p.assignedTo || '',
                    p.waitingMaterials ? 'Có' : '',
                    summarizeAdhocTimeline(p.timeline),
                    p.addedAt || '',
                    JSON.stringify(p)
                ].map(csvEscape).join(','));
            });
            return '\uFEFF' + lines.join('\r\n');
        }

        async function writeAdhocPlanBackupFile() {
            if (!logDirHandle) return;
            try {
                const options = { mode: 'readwrite' };
                if (await logDirHandle.queryPermission(options) !== 'granted') {
                    if (await logDirHandle.requestPermission(options) !== 'granted') return;
                }
                const fileHandle = await logDirHandle.getFileHandle(ADHOC_PLAN_BACKUP_FILENAME, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(buildAdhocPlanBackupCsv());
                await writable.close();
            } catch (err) {
                console.error("Lỗi ghi file sao lưu kế hoạch bảo trì đột xuất:", err);
            }
        }

        // Khôi phục lại danh sách bảo trì đột xuất chưa hoàn thành từ file sao lưu (chỉ khi bộ nhớ trình duyệt trống,
        // để không ghi đè dữ liệu mới hơn đang có trong phiên làm việc hiện tại)
        async function tryRestoreAdhocPlanFromBackupFile() {
            if (!logDirHandle || adhocPlan.length > 0) return;
            try {
                const options = { mode: 'readwrite' };
                if (await logDirHandle.queryPermission(options) !== 'granted') {
                    if (await logDirHandle.requestPermission(options) !== 'granted') return;
                }
                let fileHandle;
                try {
                    fileHandle = await logDirHandle.getFileHandle(ADHOC_PLAN_BACKUP_FILENAME, { create: false });
                } catch (e) {
                    return; // Chưa có file sao lưu nào
                }
                const file = await fileHandle.getFile();
                const text = (await file.text()).replace(/^\uFEFF/, '');
                const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
                if (lines.length <= 1) return;
                const restored = [];
                for (let i = 1; i < lines.length; i++) {
                    const cols = parsePersonnelCsvLine(lines[i]);
                    const rawJson = cols[11];
                    if (rawJson) {
                        try {
                            const obj = JSON.parse(rawJson);
                            if (obj && obj.item) restored.push(obj);
                            continue;
                        } catch (e) { /* rơi xuống khôi phục cơ bản bên dưới */ }
                    }
                    if (cols[2]) {
                        restored.push({
                            planId: Date.now() + Math.random().toString(36).substr(2, 5),
                            item: cols[2] || '',
                            name: cols[3] || '',
                            area: cols[1] || '',
                            jobText: cols[4] || '',
                            assignedTo: cols[7] || '',
                            waitingMaterials: cols[8] === 'Có',
                            timeline: [],
                            priority: 0,
                            addedAt: cols[10] || ''
                        });
                    }
                }
                if (restored.length > 0) {
                    adhocPlan = restored;
                    localStorage.setItem('adhocPlan', JSON.stringify(adhocPlan));
                    renderAdhocPlan();
                    console.log(`Đã khôi phục ${restored.length} việc bảo trì đột xuất chưa hoàn thành từ file sao lưu.`);
                }
            } catch (err) {
                console.error("Lỗi khôi phục file sao lưu kế hoạch bảo trì đột xuất:", err);
            }
        }

        // Gọi mỗi khi thư mục nhật ký (logDirHandle) vừa được kết nối/khôi phục:
        // nếu phiên làm việc hiện tại đang trống -> khôi phục từ file sao lưu; nếu đã có dữ liệu -> ghi ngay ra file để đảm bảo có bản sao lưu mới nhất.
        async function syncAdhocPlanBackupOnConnect() {
            if (adhocPlan.length > 0) {
                await writeAdhocPlanBackupFile();
            } else {
                await tryRestoreAdhocPlanFromBackupFile();
            }
        }
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
                    renderPersonnelManageModal();
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
                renderPersonnelManageModal();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    alert("Không thể chọn thư mục: " + err.message);
                }
            }
        }
        function sanitizeFileName(name) {
            return String(name).trim().replace(/[\\/:*?"<>|]/g, '_') || 'thiet_bi';
        }

        function csvEscape(value) {
            const str = value === null || value === undefined ? '' : String(value);
            if (/[",\n\r]/.test(str)) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }

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
        function openPrintWindow(title, subTitle, innerBodyHtml, extraStyle) {
            const info = getCompanyInfo();
            const printWindow = window.open('', '_blank', 'width=1000,height=700');
            const htmlContent = `
                <html>
                <head>
                    <title>${title} - ${info.company}</title>
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 30px; color: #000; background: #fff; line-height: 1.4; }
                        .header-print { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 25px; }
                        h2 { text-align: center; margin-bottom: 5px; text-transform: uppercase; font-size: 21px; font-weight: 800; letter-spacing: 0.5px; }
                        .line-mdf { text-align: center; font-size: 13px; font-style: italic; margin-bottom: 25px; color: #333; font-weight: bold; }
                        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                        th { background-color: #f5f5f5; padding: 8px; border: 1px solid #000; font-weight: bold; font-size: 11px; text-transform: uppercase; }
                        td { padding: 8px; border: 1px solid #000; font-size: 11px; }
                        .footer-sig { margin-top: 50px; display: flex; justify-content: space-between; page-break-inside: avoid; }
                        .sig-box { width: 240px; text-align: center; font-size: 13px; }
                        @media print { button { display: none; } }
                        ${extraStyle || ''}
                    </style>
                </head>
                <body>
                    <div class="header-print">
                        <div>
                            <strong style="font-size: 13px;">${info.company}</strong><br>
                            <span style="font-size: 12px; font-weight: 600;">${info.department}</span>
                        </div>
                        <div style="text-align: right; font-size: 12px; font-weight: 600;">
                            Ngày: ${new Date().toLocaleDateString('vi-VN')}<br>
                            Giờ lập phiếu: ${new Date().toLocaleTimeString('vi-VN')}
                        </div>
                    </div>

                    <h2>${title}</h2>
                    ${subTitle ? `<div class="line-mdf">${subTitle}</div>` : ''}

                    <button onclick="window.print()" style="padding: 10px 20px; background: #059669; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-bottom: 15px; font-size: 12px;">📠 Thực hiện in phiếu ra giấy</button>

                    ${innerBodyHtml}
                </body>
                </html>
            `;
            printWindow.document.write(htmlContent);
            printWindow.document.close();
        }

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
        function getCompanyInfo() {
            const stored = localStorage.getItem('companyInfo');
            if (stored) {
                try { return JSON.parse(stored); } catch (e) { /* ignore */ }
            }
            return {
                company: 'CÔNG TY CỔ PHẦN GỖ MDF VRG QUẢNG TRỊ',
                department: 'Phòng Kỹ thuật Chất lượng',
                lineName: 'Dây chuyền: MDF 2'
            };
        }

        function saveCompanyInfo(info) {
            localStorage.setItem('companyInfo', JSON.stringify(info));
            if (appMode === 'drive' && driveCompanyInfoFolderId) driveSyncJsonFile(driveCompanyInfoFolderId, 'companyInfo.json', info);
        }

        // Mục 6: tiêu đề chính "HỆ THỐNG QUẢN LÝ BẢO TRÌ CMMS - {Dây chuyền}"
        function updateMainHeaderTitle() {
            const el = document.getElementById('mainHeaderTitle');
            if (!el) return;
            const info = getCompanyInfo();
            const base = 'HỆ THỐNG QUẢN LÝ BẢO TRÌ CMMS';
            el.textContent = info.lineName ? `${base} - ${info.lineName}` : base;
        }

        function openCompanyInfoModal() {
            const info = getCompanyInfo();
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'companyInfoModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 460px;">
                    <div class="modal-header">
                        <span class="modal-title">🏢 Thông tin đơn vị</span>
                        <button class="close-modal" onclick="closeCompanyInfoModal()">✖</button>
                    </div>
                    <form onsubmit="confirmCompanyInfo(event)">
                        <div class="settings-form-group">
                            <label>Tên công ty</label>
                            <input type="text" id="ci_company" class="search-input" value="${info.company.replace(/"/g,'&quot;')}" required>
                        </div>
                        <div class="settings-form-group">
                            <label>Phòng ban</label>
                            <input type="text" id="ci_department" class="search-input" value="${info.department.replace(/"/g,'&quot;')}" required>
                        </div>
                        <div class="settings-form-group">
                            <label>Dây chuyền / Ghi chú thêm (hiển thị trên phiếu in)</label>
                            <input type="text" id="ci_lineName" class="search-input" value="${(info.lineName || '').replace(/"/g,'&quot;')}">
                        </div>
                        <div class="log-actions">
                            <button type="button" class="btn btn-slate" onclick="closeCompanyInfoModal()">Hủy</button>
                            <button type="submit" class="btn btn-emerald">💾 Lưu</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function closeCompanyInfoModal() {
            const modal = document.getElementById('companyInfoModal');
            if (modal) modal.remove();
        }

        function renderCfgCompanyInfoPreview() {
            const el = document.getElementById('cfgCompanyInfoPreview');
            if (!el) return;
            const info = getCompanyInfo();
            el.innerHTML = `<strong>${info.company}</strong><br>${info.department}${info.lineName ? ' — ' + info.lineName : ''}`;
        }

        function confirmCompanyInfo(event) {
            event.preventDefault();
            saveCompanyInfo({
                company: document.getElementById('ci_company').value.trim(),
                department: document.getElementById('ci_department').value.trim(),
                lineName: document.getElementById('ci_lineName').value.trim()
            });
            closeCompanyInfoModal();
            updateMainHeaderTitle();
            renderCfgCompanyInfoPreview();
            alert("Đã lưu thông tin đơn vị! Các phiếu in và nhật ký từ giờ sẽ dùng thông tin mới.");
        }

        // --- KẾ HOẠCH BẢO TRÌ ĐỘT XUẤT / NÂNG CẤP / THAY THẾ (KHÔNG THEO CHU KỲ) ---
        // Tạo trực tiếp 1 lệnh công việc (không mở modal xác nhận) — dùng cho luồng tạo hàng loạt
        function createWorkOrderSilent(prefill) {
            const date = prefill.date || woCurrentDate || woTodayStr();
            const order = {
                id: woGenId(),
                title: prefill.title || '',
                type: prefill.type || '',
                priority: prefill.priority || 'normal',
                shift: '',
                assignee: prefill.assignee || '',
                estHours: 0,
                device: prefill.device || '',
                deviceName: (allValidRows.find(d => d.item === prefill.device) || {}).name || '',
                description: prefill.description || '',
                status: 'pending',
                source: 'plan-bulk',
                sourceRef: prefill.sourceRef || null,
                createdAt: new Date().toLocaleString('vi-VN'),
                startedAt: '', completedAt: '', actualHours: 0, completionNotes: ''
            };
            if (!workOrders[date]) workOrders[date] = [];
            workOrders[date].push(order);
            return order;
        }

        // Xuất TOÀN BỘ danh sách (Theo chu kỳ hoặc Bảo trì đột xuất) đang xem thành các lệnh công việc,
        // để kỹ thuật viên có thể vào tab "Việc ngày" xử lý & nhập kết quả trực tiếp — bỏ qua mục đã có sẵn lệnh CV.
        function bulkCreateWorkOrdersFromPlan() {
            const kind = currentPlanSubtab; // 'cyclic' | 'adhoc'
            const list = kind === 'adhoc' ? adhocPlan : maintPlan;
            if (!list || list.length === 0) { alert('Danh sách hiện đang trống, không có gì để tạo lệnh công việc.'); return; }
            const kindLabel = kind === 'adhoc' ? 'Bảo trì đột xuất' : 'Theo chu kỳ';
            if (!confirm(`Tạo lệnh công việc cho toàn bộ ${list.length} mục trong danh sách "${kindLabel}"?\n(Mục nào đã có lệnh công việc từ trước sẽ được bỏ qua, không tạo trùng.)`)) return;

            let created = 0, skipped = 0;
            list.forEach(p => {
                if (woFindLinkedOrder(kind, p.planId)) { skipped++; return; }
                const prefill = kind === 'cyclic'
                    ? {
                        title: `${p.cycleLabel} — ${p.item}${p.name ? ' (' + p.name + ')' : ''}`,
                        type: 'Bảo trì định kỳ',
                        priority: 'normal',
                        date: p.scheduledDate || woTodayStr(),
                        assignee: p.assignedTo || '',
                        device: p.item || '',
                        description: p.jobText || '',
                        sourceRef: { planId: p.planId, kind: 'cyclic' }
                    }
                    : {
                        title: `Bảo trì đột xuất — ${p.item}${p.name ? ' (' + p.name + ')' : ''}`,
                        type: 'Sửa chữa',
                        priority: p.priority >= 3 ? 'critical' : (p.priority >= 2 ? 'urgent' : 'normal'),
                        date: woTodayStr(),
                        assignee: p.assignedTo || '',
                        device: p.item || '',
                        description: p.jobText || '',
                        sourceRef: { planId: p.planId, kind: 'adhoc' }
                    };
                createWorkOrderSilent(prefill);
                created++;
            });
            saveWorkOrdersToStorage();
            renderWorkOrderPage();
            alert(`Đã tạo ${created} lệnh công việc mới${skipped > 0 ? `, bỏ qua ${skipped} mục đã có lệnh công việc từ trước` : ''}.\nVào tab "🗂️ Việc ngày" hoặc quét mã QR để bắt đầu xử lý.`);
        }

        // Xuất mã QR dẫn thẳng tới tab "Việc ngày" của CHÍNH trang này (không phải nội dung tĩnh) —
        // kỹ thuật viên quét mã, đăng nhập Google, hệ thống tự mở đúng tab để xử lý & nhập kết quả.
        function exportPlanQrCode() {
            const url = location.origin + location.pathname + '?goto=workorder';
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'planQrModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 360px; text-align: center;">
                    <div class="modal-header">
                        <span class="modal-title">📱 Mã QR — Việc ngày</span>
                        <button class="close-modal" onclick="document.getElementById('planQrModal').remove()">✖</button>
                    </div>
                    <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 10px;">
                        Kỹ thuật viên quét mã này bằng camera điện thoại, đăng nhập Google (tài khoản đã được cấp quyền), hệ thống sẽ tự mở thẳng tab <strong>"🗂️ Việc ngày"</strong> để xem và nhập kết quả công việc trực tiếp.
                    </p>
                    <div id="planQrCanvas" style="display:flex; justify-content:center; margin:10px 0; background:white; padding:12px; border-radius:8px;"></div>
                    <div id="planQrError" style="color: var(--color-rose); font-size: 0.75rem; display: none;"></div>
                    <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 8px; word-break: break-all;">${url}</div>
                </div>
            `;
            document.body.appendChild(modal);
            try {
                if (typeof QRCode === 'undefined') throw new Error('QRCode library not loaded');
                new QRCode(document.getElementById('planQrCanvas'), {
                    text: url, width: 240, height: 240,
                    colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M
                });
            } catch (err) {
                console.error('Lỗi tạo mã QR:', err);
                document.getElementById('planQrCanvas').style.display = 'none';
                const errEl = document.getElementById('planQrError');
                if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Không tạo được mã QR: ' + err.message; }
            }
        }

        // Xuất mã QR việc riêng của 1 nhân sự cụ thể — link cố định, dùng lại được mãi mãi,
        // khi mở sẽ tự khoá bộ lọc Việc ngày theo đúng tên người này (không thấy việc của người khác).
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

        function switchPlanSubtab(tab) {
            currentPlanSubtab = tab;
            document.getElementById('subtabBtnCyclic').classList.toggle('active', tab === 'cyclic');
            document.getElementById('subtabBtnAdhoc').classList.toggle('active', tab === 'adhoc');
            document.getElementById('planSubtabCyclic').classList.toggle('hidden', tab !== 'cyclic');
            document.getElementById('planSubtabAdhoc').classList.toggle('hidden', tab !== 'adhoc');
            updatePlanActionButtons();
        }

        // Chuyển tab con (Theo chu kỳ / Bảo trì đột xuất) của danh sách RÚT GỌN ở tab Thiết bị
        let currentMiniPlanSubtab = 'cyclic';
        function switchMiniPlanSubtab(tab) {
            currentMiniPlanSubtab = tab;
            document.getElementById('miniSubtabBtnCyclic').classList.toggle('active', tab === 'cyclic');
            document.getElementById('miniSubtabBtnAdhoc').classList.toggle('active', tab === 'adhoc');
            document.getElementById('miniPlanSubtabCyclic').classList.toggle('hidden', tab !== 'cyclic');
            document.getElementById('miniPlanSubtabAdhoc').classList.toggle('hidden', tab !== 'adhoc');
        }

        // Nút "In danh sách" / "Hoàn thành tất cả" dùng chung cho cả 2 tab con,
        // trạng thái bật/tắt phụ thuộc vào danh sách của tab con đang được chọn
        function updatePlanActionButtons() {
            const count = currentPlanSubtab === 'adhoc' ? adhocPlan.length : maintPlan.length;
            if (count === 0) {
                btnCompleteAll.setAttribute('disabled', 'true');
                btnPrintPlan.setAttribute('disabled', 'true');
            } else {
                btnCompleteAll.removeAttribute('disabled');
                btnPrintPlan.removeAttribute('disabled');
            }
        }

        function saveAdhocPlanToLocalStorage() {
            localStorage.setItem('adhocPlan', JSON.stringify(adhocPlan));
            writeAdhocPlanBackupFile();
            if (appMode === 'drive' && driveAdhocPlanFolderId) driveSyncJsonFile(driveAdhocPlanFolderId, 'adhocPlan.json', adhocPlan);
        }

        function loadAdhocPlanFromLocalStorage() {
            const stored = localStorage.getItem('adhocPlan');
            if (stored) {
                try {
                    adhocPlan = JSON.parse(stored);
                    renderAdhocPlan();
                } catch (e) {
                    console.error("Lỗi khôi phục kế hoạch bảo trì đột xuất:", e);
                }
            }
        }

        // --- CẤU HÌNH ĐỢT BẢO TRÌ ĐỘT XUẤT: NGÀY BẮT ĐẦU/KẾT THÚC + TIMELINE KHUNG GIỜ (MỖI Ô = 1H) ---
        function saveAdhocCampaignToLocalStorage() {
            localStorage.setItem('adhocCampaign', JSON.stringify(adhocCampaign));
            if (appMode === 'drive' && driveAdhocCampaignFolderId) driveSyncJsonFile(driveAdhocCampaignFolderId, 'adhocCampaign.json', adhocCampaign);
        }

        function loadAdhocCampaignFromLocalStorage() {
            const stored = localStorage.getItem('adhocCampaign');
            if (stored) {
                try { adhocCampaign = JSON.parse(stored); } catch (e) { console.error("Lỗi khôi phục đợt bảo trì đột xuất:", e); }
            }
            const s = document.getElementById('adhocStartDate');
            const e = document.getElementById('adhocEndDate');
            if (s) s.value = adhocCampaign.startDate || '';
            if (e) e.value = adhocCampaign.endDate || '';
        }

        function saveAdhocCampaignHistory() {
            localStorage.setItem('adhocCampaignHistory', JSON.stringify(adhocCampaignHistory));
            if (appMode === 'drive' && driveAdhocCampaignFolderId) driveSyncJsonFile(driveAdhocCampaignFolderId, 'adhocCampaignHistory.json', adhocCampaignHistory);
        }

        function loadAdhocCampaignHistory() {
            const stored = localStorage.getItem('adhocCampaignHistory');
            if (stored) {
                try { adhocCampaignHistory = JSON.parse(stored); } catch (e) { console.error("Lỗi khôi phục lịch sử bảo trì đột xuất:", e); }
            }
        }

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

        function updateAdhocCampaignDates() {
            const s = document.getElementById('adhocStartDate').value;
            const e = document.getElementById('adhocEndDate').value;
            if (s && e && s > e) {
                alert("Ngày bắt đầu phải trước ngày kết thúc.");
                return;
            }
            adhocCampaign.startDate = s;
            adhocCampaign.endDate = e;
            saveAdhocCampaignToLocalStorage();
            renderAdhocTimelineSection();
        }

        // Trả về danh sách các ngày (yyyy-MM-dd) từ startDate đến endDate của đợt bảo trì đột xuất hiện tại
        function getAdhocCampaignDays() {
            if (!adhocCampaign.startDate || !adhocCampaign.endDate) return [];
            const pad = (n) => String(n).padStart(2, '0');
            const days = [];
            let cur = new Date(adhocCampaign.startDate + 'T00:00:00');
            const end = new Date(adhocCampaign.endDate + 'T00:00:00');
            if (isNaN(cur.getTime()) || isNaN(end.getTime()) || cur > end) return [];
            let guard = 0;
            while (cur <= end && guard < 60) {
                days.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
                cur.setDate(cur.getDate() + 1);
                guard++;
            }
            return days;
        }

        // Chọn 1 công việc trong danh sách để bắt đầu/kết thúc gán khung giờ trên timeline bên dưới
        function selectAdhocTaskForTimeline(planId) {
            selectedAdhocTaskId = (selectedAdhocTaskId === planId) ? null : planId;
            renderAdhocPlan();
            renderAdhocTimelineSection();
            if (selectedAdhocTaskId) {
                const tlEl = document.getElementById('adhocTimelineSection');
                if (tlEl) tlEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        // Bật/tắt 1 ô giờ (ngày + giờ) cho công việc đang được chọn
        function toggleAdhocTimelineCell(cellKey) {
            const task = adhocPlan.find(p => p.planId === selectedAdhocTaskId);
            if (!task) return;
            if (!task.timeline) task.timeline = [];
            const idx = task.timeline.indexOf(cellKey);
            if (idx === -1) task.timeline.push(cellKey);
            else task.timeline.splice(idx, 1);
            saveAdhocPlanToLocalStorage();
            renderAdhocTimelineSection();
            renderAdhocPlan();
        }

        // Gộp các ô giờ đã chọn của 1 công việc thành chuỗi tóm tắt dễ đọc, VD: "17/07: 08:00-12:00 | 18/07: 14:00-16:00"
        // Mục 1: hiển thị thời gian đã chọn ở card kế hoạch dạng nhiều dòng, tách riêng Ngày và Giờ bắt đầu/kết thúc
        function renderCardTimelineLines(timeline) {
            if (!timeline || timeline.length === 0) {
                return `<span class="adhoc-timeline-summary empty">Chưa chọn khung giờ</span>`;
            }
            const byDay = {};
            timeline.forEach(key => {
                const parts = key.split('_');
                const d = parts[0], h = parseInt(parts[1]);
                if (!byDay[d]) byDay[d] = [];
                byDay[d].push(h);
            });
            const days = Object.keys(byDay).sort();
            let out = '';
            days.forEach(d => {
                const hrs = byDay[d].slice().sort((a, b) => a - b);
                const ranges = [];
                let start = hrs[0], prev = hrs[0];
                for (let i = 1; i < hrs.length; i++) {
                    if (hrs[i] === prev + 1) { prev = hrs[i]; continue; }
                    ranges.push([start, prev]);
                    start = hrs[i]; prev = hrs[i];
                }
                ranges.push([start, prev]);
                const dLabel = d.split('-').reverse().join('/');
                ranges.forEach(r => {
                    out += `<div class="adhoc-timeline-summary" style="margin-bottom:3px;">
                        <div>📅 ${dLabel}</div>
                        <div>⏱ ${String(r[0]).padStart(2,'0')}:00 → ${String(r[1] + 1).padStart(2,'0')}:00</div>
                    </div>`;
                });
            });
            return out;
        }

        function summarizeAdhocTimeline(timeline) {
            if (!timeline || timeline.length === 0) return '';
            const byDay = {};
            timeline.forEach(key => {
                const parts = key.split('_');
                const d = parts[0], h = parseInt(parts[1]);
                if (!byDay[d]) byDay[d] = [];
                byDay[d].push(h);
            });
            const days = Object.keys(byDay).sort();
            const out = [];
            days.forEach(d => {
                const hrs = byDay[d].slice().sort((a, b) => a - b);
                const ranges = [];
                let start = hrs[0], prev = hrs[0];
                for (let i = 1; i < hrs.length; i++) {
                    if (hrs[i] === prev + 1) { prev = hrs[i]; continue; }
                    ranges.push([start, prev]);
                    start = hrs[i]; prev = hrs[i];
                }
                ranges.push([start, prev]);
                const dLabel = d.split('-').reverse().join('/');
                const rangeStr = ranges.map(r => `${String(r[0]).padStart(2, '0')}:00-${String(r[1] + 1).padStart(2, '0')}:00`).join(', ');
                out.push(`${dLabel}: ${rangeStr}`);
            });
            return out.join(' | ');
        }

        // Vẽ khung bảng timeline (ngày x giờ, mỗi ô = 1h) bên dưới danh sách công việc bảo trì đột xuất
        function renderAdhocTimelineSection() {
            const wrap = document.getElementById('adhocTimelineSection');
            if (!wrap) return;
            const days = getAdhocCampaignDays();

            if (days.length === 0) {
                wrap.innerHTML = adhocPlan.length > 0 ? `
                    <div class="italic text-center" style="color: var(--text-muted); padding: 14px 15px; font-size: 0.75rem;">
                        Chọn "Từ ngày" và "Đến ngày" của đợt bảo trì ở trên để hiển thị bảng khung giờ (mỗi ô = 1 giờ) cho từng công việc.
                    </div>` : '';
                return;
            }

            const activeTask = adhocPlan.find(p => p.planId === selectedAdhocTaskId);
            let html = `<div class="adhoc-timeline-title">📅 Timeline khung giờ thực hiện — ${activeTask
                ? `đang chọn cho: <strong style="color: var(--color-violet);">${activeTask.item} — ${(activeTask.name || '')}</strong> (nhấp vào ô giờ bên dưới để bật/tắt)`
                : `<span style="font-style: italic;">chọn nút "📅 Chọn khung giờ" trên 1 công việc ở danh sách phía trên để bắt đầu chọn ô giờ</span>`}</div>`;

            html += `<div class="adhoc-timeline-grid-wrap"><table class="adhoc-timeline-table"><thead><tr><th>Ngày</th>`;
            for (let h = 0; h < 24; h++) html += `<th>${String(h).padStart(2, '0')}h</th>`;
            html += `</tr></thead><tbody>`;

            days.forEach(d => {
                html += `<tr><td class="tl-day-label">${d.split('-').reverse().join('/')}</td>`;
                for (let h = 0; h < 24; h++) {
                    const key = `${d}_${h}`;
                    const isSelected = !!(activeTask && (activeTask.timeline || []).includes(key));
                    const usedByOther = !isSelected && adhocPlan.some(p => p.planId !== selectedAdhocTaskId && (p.timeline || []).includes(key));
                    const cls = ['tl-cell'];
                    if (isSelected) cls.push('tl-selected');
                    if (usedByOther) cls.push('tl-used-other');
                    if (!activeTask) cls.push('tl-disabled');
                    html += `<td class="${cls.join(' ')}" onclick="${activeTask ? `toggleAdhocTimelineCell('${key}')` : ''}" title="${d.split('-').reverse().join('/')} — ${String(h).padStart(2, '0')}:00${usedByOther ? ' (đã dùng bởi công việc khác)' : ''}"></td>`;
                }
                html += `</tr>`;
            });
            html += `</tbody></table></div>`;
            wrap.innerHTML = html;
        }

        function addToAdhocPlan(rowIdx, description, sourceNote) {
            if (currentFileIdx === -1) return;
            const file = loadedFiles[currentFileIdx];
            const struct = analyzeStructure(file.rows);
            const rawRow = file.rows[rowIdx];
            if (!rawRow) return;

            const item = struct.item !== -1 ? rawRow[struct.item] : "";
            const name = struct.name !== -1 ? rawRow[struct.name] : "";
            const area = struct.area !== -1 && rawRow[struct.area] ? String(rawRow[struct.area]).trim() : "";
            const model = struct.model !== -1 ? rawRow[struct.model] : "";
            const power = struct.power !== -1 ? rawRow[struct.power] : "";
            const current = struct.current !== -1 ? rawRow[struct.current] : "";

            let deviceInfoSummary = `Mã: ${item} | Tên: ${name}`;
            if (model) deviceInfoSummary += ` | Model: ${model}`;
            if (power) deviceInfoSummary += ` | P: ${power}kW`;
            if (current) deviceInfoSummary += ` | In: ${current}A`;

            const newPlanId = Date.now() + Math.random().toString(36).substr(2, 5);
            adhocPlan.push({
                planId: newPlanId,
                rowIdx: rowIdx,
                item: item,
                name: name,
                area: area,
                jobText: description || '',
                deviceInfo: deviceInfoSummary,
                sourceNote: sourceNote || '',
                timeline: [], // Danh sách các ô giờ đã chọn, mỗi ô dạng "yyyy-MM-dd_h"
                addedAt: getCurrentTimestamp(),
                assignedTo: '',
                priority: 0, // 0 = chưa đánh giá, 1 = ưu tiên 3 (*), 2 = ưu tiên 2 (**), 3 = ưu tiên 1 (***)
                waitingMaterials: false // true = đang "Chờ vật tư" (trạng thái thủ công)
            });

            saveAdhocPlanToLocalStorage();
            renderAdhocPlan();
            return newPlanId;
        }

        function promptAddAdhoc(rowIdx) {
            // Không hỏi/prompt nội dung, không alert — thêm thẳng thiết bị với nội dung trống
            // rồi chuyển sang tab Bảo trì đột xuất để người dùng tự nhập nội dung công việc trực tiếp.
            const newPlanId = addToAdhocPlan(rowIdx, '', 'Thêm thủ công từ Sơ đồ thiết bị');
            switchPlanSubtab('adhoc');
            // Cuộn tới thẻ công việc vừa thêm và focus vào ô nội dung công việc để nhập ngay
            setTimeout(() => {
                const el = document.querySelector(`[data-adhoc-job-id="${newPlanId}"]`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.focus();
                }
            }, 50);
        }

        function removeFromAdhocPlan(planId) {
            adhocPlan = adhocPlan.filter(p => p.planId !== planId);
            if (selectedAdhocTaskId === planId) selectedAdhocTaskId = null;
            saveAdhocPlanToLocalStorage();
            renderAdhocPlan();
        }

        function updateAdhocJobTextInline(planId, element) {
            const newText = element.innerText.trim();
            const planItem = adhocPlan.find(p => p.planId === planId);
            if (!planItem) return;
            planItem.jobText = newText;
            saveAdhocPlanToLocalStorage();
        }

        // --- MỤC 13: Đánh giá mức độ ưu tiên công việc bảo trì đột xuất theo sao ---
        // level: 1 = Ưu tiên 3 (*), 2 = Ưu tiên 2 (**), 3 = Ưu tiên 1 (***)
        function setAdhocPriority(planId, level, event) {
            if (event) event.stopPropagation();
            const planItem = adhocPlan.find(p => p.planId === planId);
            if (!planItem) return;
            planItem.priority = (planItem.priority === level) ? 0 : level;
            saveAdhocPlanToLocalStorage();
            renderAdhocPlan();
        }

        function getAdhocPriorityLabel(level) {
            if (level === 3) return 'Ưu tiên 1 (★★★)';
            if (level === 2) return 'Ưu tiên 2 (★★)';
            if (level === 1) return 'Ưu tiên 3 (★)';
            return 'Chưa đánh giá';
        }

        // --- MỤC 12: Trạng thái công việc bảo trì đột xuất ---
        // "Chờ vật tư" là trạng thái thủ công (ghi đè); nếu không, tự tính theo timeline đã chọn so với ngày hiện tại.
        function toggleAdhocWaitingMaterials(planId, event) {
            if (event) event.stopPropagation();
            const planItem = adhocPlan.find(p => p.planId === planId);
            if (!planItem) return;
            planItem.waitingMaterials = !planItem.waitingMaterials;
            saveAdhocPlanToLocalStorage();
            renderAdhocPlan();
        }

        function getAdhocJobStatus(p) {
            if (p.waitingMaterials) {
                return { key: 'waiting_materials', label: '📦 Chờ vật tư' };
            }
            const timeline = p.timeline || [];
            if (timeline.length === 0) {
                return { key: 'unscheduled', label: '🕓 Chưa lên lịch' };
            }
            const todayStr = (() => {
                const d = new Date();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            })();
            const earliestDate = timeline.map(t => String(t).split('_')[0]).sort()[0];
            if (earliestDate && earliestDate <= todayStr) {
                return { key: 'in_progress', label: '▶️ Đang thực hiện' };
            }
            // Mục 7: đã chọn khung giờ (ngày trong tương lai) nhưng chưa tới ngày thực hiện
            // -> vẫn được lưu lại trong kế hoạch, chỉ đánh dấu hoàn thành khi bấm hoàn tất
            return { key: 'scheduled', label: '📅 Đã lên lịch' };
        }

        // --- THỐNG KÊ BẢO TRÌ ĐỘT XUẤT THEO THÁNG & THEO KHU VỰC (DÙNG CHO DASHBOARD) ---
        function computeAdhocMonthlyStats() {
            const counts = {}; // 'yyyy-MM' -> số lần hoàn thành
            Object.keys(deviceLogs).forEach(itemCode => {
                (deviceLogs[itemCode] || []).forEach(e => {
                    if (e.cycleType !== 'adhoc') return;
                    const ym = (e.performedAt || '').slice(0, 7);
                    if (!ym || ym.length !== 7) return;
                    counts[ym] = (counts[ym] || 0) + 1;
                });
            });
            return counts;
        }

        function computeAdhocAreaStats() {
            const counts = {}; // Khu vực -> số lần hoàn thành
            Object.keys(deviceLogs).forEach(itemCode => {
                const device = allValidRows.find(d => d.item === itemCode);
                const area = (device && device.area) ? device.area : 'Chưa xác định khu vực';
                (deviceLogs[itemCode] || []).forEach(e => {
                    if (e.cycleType !== 'adhoc') return;
                    counts[area] = (counts[area] || 0) + 1;
                });
            });
            return counts;
        }

        // Vẽ biểu đồ cột ngang đơn giản (không cần thư viện ngoài) từ 1 object {label: value}
        function renderSimpleBarChart(dataObj, opts) {
            opts = opts || {};
            let entries = Object.entries(dataObj || {});
            if (entries.length === 0) {
                return `<div class="italic" style="color: var(--text-muted); font-size: 0.85rem; padding: 10px 0;">Chưa có dữ liệu bảo trì đột xuất nào được ghi nhận để thống kê.</div>`;
            }
            entries.sort((a, b) => opts.sortByKey ? a[0].localeCompare(b[0]) : (b[1] - a[1]));
            if (opts.limit) entries = entries.slice(0, opts.limit);
            const maxVal = Math.max.apply(null, entries.map(e => e[1]).concat([1]));
            const colors = opts.colors || ['#10b981', '#0ea5e9', '#f59e0b', '#a855f7', '#f43f5e', '#22d3ee', '#eab308', '#64748b'];
            let html = '<div class="simple-bar-chart">';
            entries.forEach((entry, idx) => {
                const label = entry[0], val = entry[1];
                const pct = Math.round((val / maxVal) * 100);
                const color = colors[idx % colors.length];
                const displayLabel = opts.formatLabel ? opts.formatLabel(label) : label;
                html += `
                    <div class="sbc-row">
                        <div class="sbc-label" title="${displayLabel.replace(/"/g,'&quot;')}">${displayLabel}</div>
                        <div class="sbc-track"><div class="sbc-fill" style="width:${pct}%; background:${color};"></div></div>
                        <div class="sbc-value">${val}</div>
                    </div>
                `;
            });
            html += '</div>';
            return html;
        }

        function filterAdhocByStatus(value) {
            adhocStatusFilter = value;
            renderAdhocPlan();
        }

        // Mục 2: chỉ khi bấm nút này mới ẩn các việc đã lên lịch nằm ngoài khung "Từ ngày/Đến ngày" đang chọn
        function toggleAdhocDateRangeFilter() {
            adhocDateRangeFilterActive = !adhocDateRangeFilterActive;
            const btn = document.getElementById('btnAdhocDateRangeFilter');
            if (btn) {
                if (adhocDateRangeFilterActive) {
                    btn.classList.remove('btn-slate');
                    btn.classList.add('btn-emerald');
                    btn.textContent = '🔍 Đang lọc theo khung ngày (bấm để bỏ)';
                } else {
                    btn.classList.remove('btn-emerald');
                    btn.classList.add('btn-slate');
                    btn.textContent = '🔍 Lọc theo khung ngày';
                }
            }
            renderAdhocPlan();
        }

        // Đếm số công việc đột xuất theo từng trạng thái (dùng cho Dashboard - mục 12)
        function computeAdhocStatusCounts() {
            const counts = { unscheduled: 0, in_progress: 0, waiting_materials: 0 };
            adhocPlan.forEach(p => {
                const st = getAdhocJobStatus(p).key;
                counts[st] = (counts[st] || 0) + 1;
            });
            return counts;
        }

        function renderAdhocPlan() {
            if (adhocPlan.length === 0) {
                adhocPlanContainer.innerHTML = `
                    <div class="italic text-center p-20" style="color: var(--text-muted); margin-top: 50px;">
                        Chưa có hạng mục bảo trì đột xuất nào.<br>
                        Dùng nút "🔧 Đột xuất" trên từng thiết bị trong sơ đồ cây, hoặc tích chọn "Thêm vào kế hoạch bảo trì" khi ghi nhận hoàn thành, để đưa thiết bị vào đây.
                    </div>
                `;
                updatePlanActionButtons();
                renderAdhocTimelineSection();
                renderMiniAdhocPlan();
                return;
            }

            let visiblePlan = adhocStatusFilter === 'all'
                ? adhocPlan
                : adhocPlan.filter(p => getAdhocJobStatus(p).key === adhocStatusFilter);

            // Mục 2: chỉ ẩn việc đã lên lịch (có khung giờ) nằm ngoài khung ngày đang chọn khi người dùng
            // chủ động bấm nút "🔍 Lọc theo khung ngày" — không tự động ẩn khi chỉ đổi Từ ngày/Đến ngày.
            if (adhocDateRangeFilterActive && adhocCampaign.startDate && adhocCampaign.endDate) {
                visiblePlan = visiblePlan.filter(p => {
                    if (!p.timeline || p.timeline.length === 0) return true; // chưa lên lịch -> vẫn hiện
                    return p.timeline.some(key => {
                        const d = String(key).split('_')[0];
                        return d >= adhocCampaign.startDate && d <= adhocCampaign.endDate;
                    });
                });
            }

            updatePlanActionButtons();
            let planHtml = '';
            const campaignActive = getAdhocCampaignDays().length > 0;

            if (visiblePlan.length === 0) {
                planHtml = `<div class="italic text-center p-20" style="color: var(--text-muted); margin-top: 30px;">Không có công việc nào khớp với bộ lọc trạng thái đã chọn.</div>`;
            }

            visiblePlan.forEach(p => {
                const isActive = p.planId === selectedAdhocTaskId;
                const priorityLvl = p.priority || 0;
                const status = getAdhocJobStatus(p);
                const inCampaignRange = campaignActive && (p.timeline || []).some(key => {
                    const d = String(key).split('_')[0];
                    return d >= adhocCampaign.startDate && d <= adhocCampaign.endDate;
                });
                planHtml += `
                    <div class="plan-item-card ${isActive ? 'adhoc-card-active' : ''}" style="${inCampaignRange ? 'border-left:3px solid var(--color-emerald);' : ''}">
                        <div class="plan-card-split">
                            <div class="plan-panel-left">
                                <input type="checkbox" class="checkbox-custom" onclick="event.preventDefault(); openCompleteAdhocLogModal('${p.planId}')" title="Đánh dấu hoàn tất và ghi nhật ký">
                                <div class="plan-item-info">
                                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                        <span class="plan-cycle-badge badge-adhoc">🔧 Bảo trì đột xuất</span>
                                        <span class="adhoc-status-badge adhoc-status-${status.key}">${status.label}</span>
                                        <button type="button" class="btn-toggle-waiting ${p.waitingMaterials ? 'active' : ''}" onclick="toggleAdhocWaitingMaterials('${p.planId}', event)" title="Đánh dấu/bỏ đánh dấu công việc đang chờ vật tư">📦 Chờ vật tư</button>
                                    </div>
                                    <strong style="color: white; font-size:0.8rem; margin-top:3px;">${p.item}${p.area ? ` <span style="color:var(--text-muted); font-weight:400; font-size:0.75rem;">📍 ${p.area}</span>` : ''}</strong>
                                    <span style="font-size:0.8rem; color:var(--color-emerald);">${p.name}</span>
                                    <div class="plan-job-desc" contenteditable="true"
                                         data-adhoc-job-id="${p.planId}"
                                         onblur="updateAdhocJobTextInline('${p.planId}', this)"
                                         onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault(); this.blur();}"
                                         title="Nhấp để chỉnh sửa nội dung công việc">${p.jobText ? p.jobText.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</div>
                                    <div class="job-edit-hint">✎ Nhấp vào nội dung để chỉnh sửa • Thêm lúc: ${p.addedAt}${p.sourceNote ? ' • ' + p.sourceNote : ''}</div>
                                    <div class="importance-row" style="margin-top:4px;">
                                        <div class="adhoc-priority-stars lvl-${priorityLvl}" title="Nhấp vào sao để đánh dấu mức độ ưu tiên">
                                            <span class="star ${priorityLvl >= 1 ? 'active' : ''}" title="Ưu tiên 3 (*)" onclick="setAdhocPriority('${p.planId}', 1, event)">★</span>
                                            <span class="star ${priorityLvl >= 2 ? 'active' : ''}" title="Ưu tiên 2 (**)" onclick="setAdhocPriority('${p.planId}', 2, event)">★</span>
                                            <span class="star ${priorityLvl >= 3 ? 'active' : ''}" title="Ưu tiên 1 (***)" onclick="setAdhocPriority('${p.planId}', 3, event)">★</span>
                                        </div>
                                        <span class="importance-label" style="font-size:0.7rem; color:var(--text-muted); margin-left:6px;">${getAdhocPriorityLabel(priorityLvl)}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="plan-panel-right">
                                <span class="plan-panel-right-label">📅 Ngày thực hiện</span>
                                ${campaignActive ? `
                                <div class="adhoc-timeline-row">
                                    <button type="button" class="btn-timeline-select ${isActive ? 'active' : ''}" onclick="selectAdhocTaskForTimeline('${p.planId}')">📅 ${isActive ? 'Đang chọn khung giờ…' : 'Chọn khung giờ'}</button>
                                </div>
                                ${renderCardTimelineLines(p.timeline)}
                                ` : `<span style="font-size:0.72rem; color: var(--text-muted); font-style: italic;">Chọn "Từ ngày/Đến ngày" của đợt bảo trì ở trên để bật khung giờ.</span>`}
                                <span class="plan-panel-right-label" style="margin-top:6px;">👤 Người thực hiện</span>
                                <select class="search-input" style="padding:5px 6px; font-size:0.78rem;" onchange="updateAdhocAssignedTo('${p.planId}', this.value)">${personnelOptionsHtml(p.assignedTo)}</select>
                                <button type="button" class="btn btn-sky" style="margin-top:8px; padding:5px 8px; font-size:0.72rem;" onclick="createWorkOrderFromPlanItem('${p.planId}', 'adhoc')">📋 Giao việc (tạo lệnh CV)</button>
                            </div>
                        </div>
                        <button onclick="removeFromAdhocPlan('${p.planId}')" class="btn-remove-plan" title="Hủy bỏ">✖</button>
                    </div>
                `;
            });

            adhocPlanContainer.innerHTML = planHtml;
            renderAdhocTimelineSection();
            renderMiniAdhocPlan();
        }

        // Danh sách RÚT GỌN (tab Thiết bị): chỉ khu vực/mã thiết bị + nút bỏ chọn
        function renderMiniAdhocPlan() {
            const el = document.getElementById('miniPlanSubtabAdhoc');
            if (!el) return;
            if (adhocPlan.length === 0) {
                el.innerHTML = `
                    <div class="italic text-center p-20" style="color: var(--text-muted); margin-top: 30px;">
                        Chưa có hạng mục bảo trì đột xuất nào.<br>
                        Dùng nút "🔧 Đột xuất" trên từng thiết bị trong sơ đồ cây để đưa vào đây.
                    </div>
                `;
                return;
            }
            let html = '';
            adhocPlan.forEach(p => {
                html += `
                    <div class="mini-plan-item">
                        <div class="mini-plan-item-info">
                            ${p.area ? `<span class="mini-plan-item-area">📍 ${p.area}</span>` : ''}
                            <span class="mini-plan-item-name">${p.item}${p.name ? ' — ' + p.name : ''}</span>
                            <span class="mini-plan-item-sub">🔧 Bảo trì đột xuất</span>
                        </div>
                        <button onclick="removeFromAdhocPlan('${p.planId}')" class="btn-remove-plan" title="Bỏ chọn">✖</button>
                    </div>
                `;
            });
            el.innerHTML = html;
        }

        function openCompleteAdhocLogModal(planId) {
            const planItem = adhocPlan.find(p => p.planId === planId);
            if (!planItem) return;

            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const defaultDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'completeAdhocLogModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 520px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <span class="modal-title">📝 Ghi nhận hoàn thành bảo trì đột xuất</span>
                        <button class="close-modal" onclick="closeCompleteAdhocLogModal()">✖</button>
                    </div>
                    <div style="font-size: 0.85rem; margin-bottom: 12px; color: white;">
                        <strong style="color: var(--color-violet);">${planItem.item}</strong> — ${planItem.name}<br>
                        <span style="color: var(--text-muted); font-size: 0.78rem; white-space:pre-wrap;">${(planItem.jobText || '').replace(/</g,'&lt;')}</span>
                    </div>
                    <form onsubmit="confirmCompleteAdhoc(event, '${planId}')">
                        <div class="log-form-group">
                            <label>Ngày giờ thực hiện *</label>
                            <input type="datetime-local" id="alog_performedAt" class="search-input" value="${defaultDateTime}" required>
                        </div>
                        <div class="log-form-group">
                            <label>Người thực hiện *</label>
                            <select id="alog_performedBy" class="search-input" required>${personnelOptionsHtml(planItem.assignedTo)}</select>
                        </div>
                        <div class="log-form-group">
                            <label>Người kiểm tra / giám sát</label>
                            <select id="alog_checkedBy" class="search-input">${personnelOptionsHtml('')}</select>
                        </div>
                        <div class="log-form-group">
                            <label>Vật tư thay thế</label>
                            <textarea id="alog_materials" class="log-textarea" placeholder="VD: 1x động cơ 5.5kW, 2x vòng bi..."></textarea>
                        </div>
                        <div class="log-form-group">
                            <label>Kết quả *</label>
                            <select id="alog_result" class="search-input" required>
                                <option value="pass">✅ Đạt</option>
                                <option value="note">⚠️ Đạt, có lưu ý</option>
                                <option value="fail">❌ Không đạt</option>
                            </select>
                        </div>
                        <div class="log-form-group">
                            <label>Thời gian dừng máy (phút)</label>
                            <input type="number" min="0" id="alog_downtime" class="search-input" placeholder="0">
                        </div>
                        <div class="log-form-group">
                            <label>Ghi chú</label>
                            <textarea id="alog_notes" class="log-textarea" placeholder="Tình trạng, đề xuất, sự cố phát sinh..."></textarea>
                        </div>
                        <div class="log-form-group" style="margin-bottom: 12px;">
                            <div class="rca-add-box">
                                <div class="rca-add-box-title">➕ Thêm vào</div>
                                <div class="rca-add-box-option">
                                    <input type="checkbox" id="alog_addToRCA" style="width: 16px; height: 16px; accent-color: var(--color-rose); flex-shrink: 0;">
                                    <label for="alog_addToRCA" style="color: var(--color-rose);">🔍 RCA <span style="font-weight:400; color:var(--text-muted); font-size:0.7rem;">(phân tích nguyên nhân gốc rễ)</span></label>
                                </div>
                            </div>
                        </div>
                        <div class="log-actions">
                            <button type="button" class="btn btn-slate" onclick="closeCompleteAdhocLogModal()">Hủy</button>
                            <button type="submit" class="btn btn-emerald">✔️ Xác nhận hoàn thành</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
            setTimeout(() => document.getElementById('alog_performedBy').focus(), 50);
        }

        function closeCompleteAdhocLogModal() {
            const modal = document.getElementById('completeAdhocLogModal');
            if (modal) modal.remove();
        }

        function confirmCompleteAdhoc(event, planId) {
            event.preventDefault();
            const planItem = adhocPlan.find(p => p.planId === planId);
            if (!planItem) return;

            const performedAt = document.getElementById('alog_performedAt').value.replace('T', ' ');
            const performedBy = document.getElementById('alog_performedBy').value.trim();
            const checkedBy = document.getElementById('alog_checkedBy').value.trim();
            const materials = document.getElementById('alog_materials').value.trim();
            const result = document.getElementById('alog_result').value;
            const downtimeMinutes = document.getElementById('alog_downtime').value.trim();
            const notes = document.getElementById('alog_notes').value.trim();
            const addToRCA = document.getElementById('alog_addToRCA').checked;

            const adhocLogEntry = {
                id: Date.now() + Math.random().toString(36).substr(2, 5),
                performedAt: performedAt,
                cycleType: 'adhoc',
                cycleLabel: '🔧 Bảo trì đột xuất',
                jobText: planItem.jobText || '',
                materials: materials,
                performedBy: performedBy,
                checkedBy: checkedBy,
                result: result,
                downtimeMinutes: downtimeMinutes,
                notes: notes,
                recordedAt: getCurrentTimestamp()
            };
            addDeviceLogEntry(planItem.item, adhocLogEntry);
            writeDeviceLogFile(planItem.item);
            archiveAdhocCompletion(planItem, adhocLogEntry);

            let newRcaRecord = null;
            if (addToRCA) {
                newRcaRecord = createRcaRecord(
                    { rowIdx: planItem.rowIdx, item: planItem.item, name: planItem.name, area: planItem.area },
                    notes || planItem.jobText || '',
                    'adhoc',
                    `Bảo trì đột xuất — hoàn thành ${performedAt}`
                );
            }

            removeFromAdhocPlan(planId);
            closeCompleteAdhocLogModal();
            processDataset();
            woSyncLinkedOrderOnPlanComplete('adhoc', planId, { performedAt, performedBy, notes });

            if (newRcaRecord) {
                switchMainTab('rca');
                openRcaEditor(newRcaRecord.id);
            }
        }

        function completeAllAdhocPlan() {
            if (adhocPlan.length === 0) return;
            const performedBy = prompt(`Xác nhận hoàn tất toàn bộ ${adhocPlan.length} hạng mục bảo trì đột xuất hiện tại.\n\nVui lòng nhập tên người thực hiện (áp dụng chung):`, "");
            if (performedBy === null) return;
            if (!performedBy.trim()) {
                alert("Vui lòng nhập tên người thực hiện để tiếp tục.");
                return;
            }
            const timestamp = getCurrentTimestamp();
            adhocPlan.forEach(item => {
                const batchLogEntry = {
                    id: Date.now() + Math.random().toString(36).substr(2, 5),
                    performedAt: timestamp,
                    cycleType: 'adhoc',
                    cycleLabel: '🔧 Bảo trì đột xuất',
                    jobText: item.jobText || '',
                    materials: '',
                    performedBy: performedBy.trim(),
                    checkedBy: '',
                    result: 'pass',
                    downtimeMinutes: '',
                    notes: 'Hoàn thành theo kế hoạch bảo trì đột xuất (xử lý hàng loạt).',
                    recordedAt: timestamp
                };
                addDeviceLogEntry(item.item, batchLogEntry);
                writeDeviceLogFile(item.item);
                archiveAdhocCompletion(item, batchLogEntry);
                woSyncLinkedOrderOnPlanComplete('adhoc', item.planId, { performedAt: timestamp, performedBy: performedBy.trim(), notes: batchLogEntry.notes });
            });
            adhocPlan = [];
            selectedAdhocTaskId = null;
            saveAdhocPlanToLocalStorage();
            renderAdhocPlan();
            alert("Đã hoàn thành hàng loạt kế hoạch bảo trì đột xuất!");
        }

        // --- LƯU HOÀN THÀNH VÀO LỊCH SỬ ĐỢT BẢO TRÌ ĐỘT XUẤT + GHI FILE NHẬT KÝ CỦA ĐỢT ---
        function archiveAdhocCompletion(planItem, logEntry) {
            const campaignKey = (adhocCampaign.startDate && adhocCampaign.endDate)
                ? `${adhocCampaign.startDate}__${adhocCampaign.endDate}`
                : 'khong-xac-dinh';
            let campaign = adhocCampaignHistory.find(c => c.key === campaignKey);
            if (!campaign) {
                campaign = {
                    key: campaignKey,
                    startDate: adhocCampaign.startDate || '',
                    endDate: adhocCampaign.endDate || '',
                    createdAt: getCurrentTimestamp(),
                    items: []
                };
                adhocCampaignHistory.push(campaign);
            }
            campaign.items.push({
                item: planItem.item,
                name: planItem.name,
                area: planItem.area || '',
                jobText: planItem.jobText || '',
                timeline: planItem.timeline || [],
                performedAt: logEntry.performedAt,
                performedBy: logEntry.performedBy,
                result: logEntry.result,
                notes: logEntry.notes
            });
            saveAdhocCampaignHistory();
            writeAdhocCampaignLogFile(campaign);
        }

        function buildAdhocCampaignCsv(campaign) {
            const header = ['STT', 'Khu vực', 'Mã TB', 'Tên TB', 'Nội dung công việc', 'Khung giờ đã chọn', 'Người thực hiện', 'Kết quả', 'Ghi chú', 'Ngày giờ thực hiện'];
            const lines = [header.map(csvEscape).join(',')];
            campaign.items.forEach((it, idx) => {
                lines.push([
                    idx + 1, it.area || '', it.item, it.name, it.jobText || '',
                    summarizeAdhocTimeline(it.timeline), it.performedBy || '', resultLabel(it.result), it.notes || '', it.performedAt || ''
                ].map(csvEscape).join(','));
            });
            return '\uFEFF' + lines.join('\r\n');
        }

        async function writeAdhocCampaignLogFile(campaign) {
            if (!logDirHandle) return;
            try {
                const options = { mode: 'readwrite' };
                if (await logDirHandle.queryPermission(options) !== 'granted') {
                    if (await logDirHandle.requestPermission(options) !== 'granted') return;
                }
                const rangeLabel = (campaign.startDate && campaign.endDate) ? `${campaign.startDate}_${campaign.endDate}` : 'khong_xac_dinh';
                const fileName = 'DotBaoTriDotXuat_' + sanitizeFileName(rangeLabel) + '.csv';
                const fileHandle = await logDirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(buildAdhocCampaignCsv(campaign));
                await writable.close();
            } catch (err) {
                console.error("Lỗi ghi file nhật ký đợt bảo trì đột xuất:", err);
            }
        }

        // --- XEM LẠI LỊCH SỬ CÁC ĐỢT BẢO TRÌ ĐỘT XUẤT ĐÃ HOÀN THÀNH (Mục 6: dạng biểu đồ cột 12 tháng) ---
        function campaignDurationDays(c) {
            if (!c.startDate || !c.endDate) return 1;
            const ms = new Date(c.endDate) - new Date(c.startDate);
            const days = Math.round(ms / 86400000) + 1;
            return days > 0 ? days : 1;
        }

        function renderAdhocHistoryChart(year) {
            const wrap = document.getElementById('adhocHistoryChartWrap');
            if (!wrap) return;

            const years = Array.from(new Set(adhocCampaignHistory
                .map(c => (c.startDate || '').slice(0, 4))
                .filter(y => y))).sort((a, b) => b.localeCompare(a));
            if (years.length === 0) {
                wrap.innerHTML = `<div class="italic text-center" style="color: var(--text-muted); padding: 20px 0;">Chưa có lịch sử đợt bảo trì đột xuất nào được ghi nhận.</div>`;
                return;
            }
            if (!year || !years.includes(year)) year = years[0];

            const byMonth = Array.from({ length: 12 }, () => []);
            adhocCampaignHistory.forEach(c => {
                if ((c.startDate || '').slice(0, 4) !== year) return;
                const m = parseInt(c.startDate.slice(5, 7), 10) - 1;
                if (m >= 0 && m < 12) byMonth[m].push(c);
            });

            const maxDuration = Math.max(1, ...adhocCampaignHistory
                .filter(c => (c.startDate || '').slice(0, 4) === year)
                .map(campaignDurationDays));

            const monthsHtml = byMonth.map(list => {
                if (list.length === 0) return `<div class="history-chart-month"></div>`;
                const bars = list.map(c => {
                    const days = campaignDurationDays(c);
                    const heightPct = Math.max(8, Math.round((days / maxDuration) * 100));
                    const label = (c.startDate && c.endDate)
                        ? `${c.startDate.split('-').reverse().join('/')} → ${c.endDate.split('-').reverse().join('/')}`
                        : 'Không xác định ngày';
                    return `<div class="history-chart-bar" style="height:${heightPct}%;" onclick='showAdhocHistoryDetail(${JSON.stringify(c.key)})'>
                        <span class="bar-value">${days}</span>
                        <span class="bar-tip">${label}<br>${days} ngày • ${c.items.length} hạng mục</span>
                    </div>`;
                }).join('');
                return `<div class="history-chart-month">${bars}</div>`;
            }).join('');

            const labelsHtml = ['Th1','Th2','Th3','Th4','Th5','Th6','Th7','Th8','Th9','Th10','Th11','Th12']
                .map(l => `<span>${l}</span>`).join('');

            const yearOptions = years.map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('');

            wrap.innerHTML = `
                <div class="history-chart-yearbar">
                    <span style="font-size:0.78rem; color: var(--text-muted);">Năm:</span>
                    <select class="search-input" style="width:auto;" onchange="renderAdhocHistoryChart(this.value)">${yearOptions}</select>
                </div>
                <div class="history-chart">${monthsHtml}</div>
                <div class="history-chart-labels">${labelsHtml}</div>
            `;
        }

        function openAdhocHistoryModal() {
            loadAdhocCampaignHistory();
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'adhocHistoryModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 640px; max-width: 96%; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <span class="modal-title">📜 Nhật ký</span>
                        <button class="close-modal" onclick="document.getElementById('adhocHistoryModal').remove()">✖</button>
                    </div>
                    <div class="history-chart-wrap" id="adhocHistoryChartWrap"></div>
                </div>
            `;
            document.body.appendChild(modal);
            renderAdhocHistoryChart();
        }

        function showAdhocHistoryDetail(key) {
            const campaign = adhocCampaignHistory.find(c => c.key === key);
            if (!campaign) return;
            const existingList = document.getElementById('adhocHistoryModal');
            if (existingList) existingList.remove();
            const label = (campaign.startDate && campaign.endDate) ? `${campaign.startDate.split('-').reverse().join('/')} → ${campaign.endDate.split('-').reverse().join('/')}` : 'Không xác định ngày đợt';

            let rows = '';
            campaign.items.forEach((it, idx) => {
                rows += `
                    <tr>
                        <td style="text-align:center;">${idx + 1}</td>
                        <td style="text-align:center;">${(it.area || '—').replace(/</g,'&lt;')}</td>
                        <td style="text-align:center; font-weight:bold;">${it.item}</td>
                        <td>${(it.name || '').replace(/</g,'&lt;')}</td>
                        <td style="white-space:pre-wrap;">${(it.jobText || '').replace(/</g,'&lt;')}</td>
                        <td style="font-size:0.7rem;">${summarizeAdhocTimeline(it.timeline) || '—'}</td>
                        <td>${(it.performedBy || '').replace(/</g,'&lt;')}</td>
                        <td style="text-align:center;">${resultLabel(it.result)}</td>
                        <td style="white-space:pre-wrap;">${(it.notes || '—').replace(/</g,'&lt;')}</td>
                    </tr>
                `;
            });

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'adhocHistoryDetailModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 1000px; max-width: 97%; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <span class="modal-title">📜 Nhật ký — ${label}</span>
                        <button class="close-modal" onclick="document.getElementById('adhocHistoryDetailModal').remove()">✖</button>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-size:0.78rem; color:var(--text-muted);">${campaign.items.length} hạng mục đã hoàn thành</span>
                        <button class="btn btn-slate" style="font-size:0.75rem; padding:6px 10px;" onclick='printAdhocHistoryDetail(${JSON.stringify(key)})'>📠 In lịch sử</button>
                    </div>
                    <div class="log-table-wrap">
                        <table class="log-report-table">
                            <thead>
                                <tr><th>STT</th><th>Khu vực</th><th>Mã TB</th><th>Tên TB</th><th>Nội dung</th><th>Khung giờ</th><th>Người thực hiện</th><th>Kết quả</th><th>Ghi chú</th></tr>
                            </thead>
                            <tbody>${rows || '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">Không có dữ liệu</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function printAdhocHistoryDetail(key) {
            const campaign = adhocCampaignHistory.find(c => c.key === key);
            if (!campaign) return;
            const label = (campaign.startDate && campaign.endDate) ? `${campaign.startDate.split('-').reverse().join('/')} → ${campaign.endDate.split('-').reverse().join('/')}` : 'Không xác định ngày đợt';

            let rows = '';
            campaign.items.forEach((it, idx) => {
                rows += `
                    <tr>
                        <td style="text-align:center;">${idx + 1}</td>
                        <td style="text-align:center;">${(it.area || '—').replace(/</g,'&lt;')}</td>
                        <td style="text-align:center; font-weight:bold;">${it.item}</td>
                        <td>${(it.name || '').replace(/</g,'&lt;')}</td>
                        <td style="white-space:pre-wrap;">${(it.jobText || '').replace(/</g,'&lt;')}</td>
                        <td style="font-size:10px;">${summarizeAdhocTimeline(it.timeline) || '—'}</td>
                        <td>${(it.performedBy || '').replace(/</g,'&lt;')}</td>
                        <td style="text-align:center;">${resultLabel(it.result)}</td>
                        <td style="white-space:pre-wrap;">${(it.notes || '—').replace(/</g,'&lt;')}</td>
                    </tr>
                `;
            });

            const bodyHtml = `
                <table>
                    <thead>
                        <tr>
                            <th style="width:4%;">STT</th><th style="width:9%;">Khu vực</th><th style="width:10%;">Mã TB</th><th style="width:13%;">Tên TB</th>
                            <th style="width:19%;">Nội dung</th><th style="width:14%;">Khung giờ</th><th style="width:10%;">Người thực hiện</th><th style="width:8%;">Kết quả</th><th style="width:13%;">Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            `;
            const lineInfo = getCompanyInfo().lineName;
            openPrintWindow('LỊCH SỬ BẢO TRÌ ĐỘT XUẤT', `${lineInfo ? lineInfo + '<br>' : ''}Đợt: ${label}`, bodyHtml);
        }

        // Vẽ mini-timeline (dạng dải ô nhỏ, mỗi ô = 1h) để in trong phiếu bảo trì đột xuất
        function renderTimelineMiniHtml(timeline) {
            if (!timeline || timeline.length === 0) return '<span style="color:#999; font-size:10px;">Chưa chọn khung giờ</span>';
            const byDay = {};
            timeline.forEach(key => {
                const parts = key.split('_');
                const d = parts[0], h = parseInt(parts[1]);
                if (!byDay[d]) byDay[d] = new Set();
                byDay[d].add(h);
            });
            const days = Object.keys(byDay).sort();
            return days.map(d => {
                const hoursSet = byDay[d];
                let cells = '';
                for (let h = 0; h < 24; h++) {
                    const on = hoursSet.has(h);
                    cells += `<span style="display:inline-block; width:3px; height:9px; margin-right:1px; background:${on ? '#7c3aed' : '#e2e2e2'};"></span>`;
                }
                const dLabel = d.split('-').reverse().join('/');
                return `<div style="margin-bottom:3px;"><span style="font-size:9px; color:#555;">${dLabel}</span><br>${cells}</div>`;
            }).join('');
        }

        // Mục 5: hiển thị đơn giản Ngày + khung giờ (giống phần hiển thị dưới nút "Chọn khung giờ" trong app) —
        // dùng cho phiếu in, kèm mức độ ưu tiên (Ưu tiên 1/2/3) trong cùng cột "Thời gian thực hiện"
        function renderPrintTimeAndPriority(p) {
            const priorityLvl = p.priority || 0;
            const priorityHtml = priorityLvl > 0
                ? `<div style="font-weight:bold; color:#7c3aed; margin-bottom:4px;">${getAdhocPriorityLabel(priorityLvl)}</div>`
                : '';
            if (!p.timeline || p.timeline.length === 0) {
                return priorityHtml + '<span style="color:#999;">Chưa chọn khung giờ</span>';
            }
            const byDay = {};
            p.timeline.forEach(key => {
                const parts = key.split('_');
                const d = parts[0], h = parseInt(parts[1]);
                if (!byDay[d]) byDay[d] = [];
                byDay[d].push(h);
            });
            const days = Object.keys(byDay).sort();
            let out = '';
            days.forEach(d => {
                const hrs = byDay[d].slice().sort((a, b) => a - b);
                const ranges = [];
                let start = hrs[0], prev = hrs[0];
                for (let i = 1; i < hrs.length; i++) {
                    if (hrs[i] === prev + 1) { prev = hrs[i]; continue; }
                    ranges.push([start, prev]);
                    start = hrs[i]; prev = hrs[i];
                }
                ranges.push([start, prev]);
                const dLabel = d.split('-').reverse().join('/');
                ranges.forEach(r => {
                    out += `<div style="margin-bottom:3px;">📅 ${dLabel} &nbsp; ⏱ ${String(r[0]).padStart(2,'0')}:00 → ${String(r[1] + 1).padStart(2,'0')}:00</div>`;
                });
            });
            return priorityHtml + out;
        }

        function printAdhocMaintenancePlan() {
            if (adhocPlan.length === 0) {
                alert("Danh sách trống!");
                return;
            }
            let tableRows = '';
            adhocPlan.forEach((p, idx) => {
                tableRows += `
                    <tr>
                        <td style="text-align:center;">${idx + 1}</td>
                        <td style="text-align:center;">${p.area || '—'}</td>
                        <td style="text-align:center; font-weight:bold;">${p.item}</td>
                        <td style="text-align:center;">${p.name}</td>
                        <td style="white-space:pre-wrap; text-align:left;">${(p.jobText || '').replace(/</g,'&lt;')}${p.waitingMaterials ? '<div style="margin-top:6px; color:#b45309; font-weight:bold;">📦 Chờ vật tư</div>' : ''}</td>
                        <td style="text-align:left;">${renderPrintTimeAndPriority(p)}</td>
                        <td style="text-align:center;">${p.assignedTo || '—'}</td>
                        <td style="width:95px; text-align:left; font-weight:bold;">[  ] Đạt<br><br>[  ] Không đạt</td>
                    </tr>
                `;
            });
            const campaignLabel = (adhocCampaign.startDate && adhocCampaign.endDate)
                ? `Đợt bảo trì: ${adhocCampaign.startDate.split('-').reverse().join('/')} → ${adhocCampaign.endDate.split('-').reverse().join('/')}`
                : '';
            const bodyHtml = `
                <table>
                    <thead>
                        <tr>
                            <th style="width:4%;">STT</th><th style="width:8%;">Khu vực</th><th style="width:10%;">Mã Thiết Bị</th><th style="width:12%;">Chức năng</th>
                            <th style="width:21%;">Nội dung công việc</th><th style="width:20%;">Thời gian thực hiện</th><th style="width:11%;">Người thực hiện</th><th style="width:11%;">Kết quả</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
                <div class="footer-sig">
                    <div class="sig-box"><p><strong>Người thực hiện</strong></p><span style="font-size:11px; color:#555;">(Ký & ghi rõ họ tên)</span><br><br><br><br><br><p>.......................................</p></div>
                    <div class="sig-box"><p><strong>Người kiểm tra</strong></p><span style="font-size:11px; color:#555;">(Ký & ghi rõ họ tên)</span><br><br><br><br><br><p>.......................................</p></div>
                    <div class="sig-box"><p><strong>Trưởng phòng KTCL</strong></p><span style="font-size:11px; color:#555;">(Phê duyệt hoàn thành)</span><br><br><br><br><br><p>.......................................</p></div>
                </div>
            `;
            const lineInfo = getCompanyInfo().lineName;
            const ticketSubTitle = `${lineInfo || ''}${campaignLabel ? (lineInfo ? '<br>' : '') + campaignLabel : ''}`;
            openPrintWindow('PHIẾU BẢO TRÌ ĐỘT XUẤT', ticketSubTitle, bodyHtml);
        }

        // --- BÁO CÁO TỔNG HỢP NHẬT KÝ TOÀN NHÀ MÁY THEO KHOẢNG THỜI GIAN ---
        function openSummaryReportModal() {
            const today = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
            const firstOfMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'summaryReportModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 420px;">
                    <div class="modal-header">
                        <span class="modal-title">📈 Báo cáo tổng hợp nhật ký toàn nhà máy</span>
                        <button class="close-modal" onclick="closeSummaryReportModal()">✖</button>
                    </div>
                    <form onsubmit="generateAndShowSummaryReport(event)">
                        <div class="settings-form-group">
                            <label>Từ ngày</label>
                            <input type="date" id="sr_fromDate" class="search-input" value="${firstOfMonth}" required>
                        </div>
                        <div class="settings-form-group">
                            <label>Đến ngày</label>
                            <input type="date" id="sr_toDate" class="search-input" value="${todayStr}" required>
                        </div>
                        <div class="log-actions">
                            <button type="button" class="btn btn-slate" onclick="closeSummaryReportModal()">Hủy</button>
                            <button type="submit" class="btn btn-emerald">📈 Xem báo cáo</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function closeSummaryReportModal() {
            const modal = document.getElementById('summaryReportModal');
            if (modal) modal.remove();
        }

        function collectLogsInRange(fromDate, toDate) {
            const from = fromDate; // yyyy-MM-dd
            const to = toDate;
            const results = [];
            Object.keys(deviceLogs).forEach(itemCode => {
                (deviceLogs[itemCode] || []).forEach(e => {
                    const d = (e.performedAt || '').split(' ')[0];
                    if (d >= from && d <= to) {
                        results.push(Object.assign({ itemCode }, e));
                    }
                });
            });
            results.sort((a, b) => (a.performedAt < b.performedAt ? -1 : 1));
            return results;
        }

        function generateAndShowSummaryReport(event) {
            event.preventDefault();
            const fromDate = document.getElementById('sr_fromDate').value;
            const toDate = document.getElementById('sr_toDate').value;
            closeSummaryReportModal();

            const entries = collectLogsInRange(fromDate, toDate);
            const totalCount = entries.length;
            const passCount = entries.filter(e => e.result === 'pass').length;
            const noteCount = entries.filter(e => e.result === 'note').length;
            const failCount = entries.filter(e => e.result === 'fail').length;
            const deviceSet = new Set(entries.map(e => e.itemCode));
            const totalDowntime = entries.reduce((sum, e) => sum + (parseInt(e.downtimeMinutes) || 0), 0);
            const failDevices = entries.filter(e => e.result === 'fail');

            let tableRows = '';
            entries.forEach((e, idx) => {
                tableRows += `
                    <tr>
                        <td style="text-align:center;">${idx + 1}</td>
                        <td style="white-space:nowrap;">${e.performedAt}</td>
                        <td style="font-weight:bold;">${e.itemCode}</td>
                        <td>${e.cycleLabel || ''}</td>
                        <td>${(e.performedBy || '').replace(/</g,'&lt;')}</td>
                        <td style="text-align:center;">${resultLabel(e.result)}</td>
                        <td style="white-space:pre-wrap;">${(e.notes || '—').replace(/</g,'&lt;')}</td>
                    </tr>
                `;
            });

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'summaryReportResultModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 960px; max-width: 96%; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <span class="modal-title">📈 Báo cáo tổng hợp: ${fromDate} → ${toDate}</span>
                        <button class="close-modal" onclick="document.getElementById('summaryReportResultModal').remove()">✖</button>
                    </div>
                    ${getCompanyInfo().lineName ? `<div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:10px;"><strong style="color:var(--text-main);">${getCompanyInfo().lineName}</strong></div>` : ''}

                    <div class="dashboard-grid" style="margin-bottom:16px;">
                        <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-label">Tổng lượt bảo trì</div><div class="stat-value">${totalCount}</div><div class="stat-sub">${deviceSet.size} thiết bị liên quan</div></div>
                        <div class="stat-card c-emerald"><div class="stat-icon">✅</div><div class="stat-label">Đạt</div><div class="stat-value">${passCount}</div><div class="stat-sub">${totalCount ? Math.round(passCount/totalCount*100) : 0}% tổng số</div></div>
                        <div class="stat-card c-amber"><div class="stat-icon">⚠️</div><div class="stat-label">Đạt, có lưu ý</div><div class="stat-value">${noteCount}</div><div class="stat-sub">Cần theo dõi thêm</div></div>
                        <div class="stat-card c-rose"><div class="stat-icon">❌</div><div class="stat-label">Không đạt</div><div class="stat-value">${failCount}</div><div class="stat-sub">Tổng dừng máy: ${totalDowntime} phút</div></div>
                    </div>

                    ${failDevices.length > 0 ? `
                    <div class="dashboard-section-title">⚠️ Thiết bị có kết quả "Không đạt" cần chú ý</div>
                    <div style="margin-bottom:16px; font-size:0.8rem;">
                        ${failDevices.map(e => `<div style="padding:6px 0; border-bottom:1px solid var(--border-color);"><strong style="color:var(--color-rose);">${e.itemCode}</strong> — ${e.performedAt} — ${(e.notes || 'Không có ghi chú').replace(/</g,'&lt;')}</div>`).join('')}
                    </div>` : ''}

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-size:0.78rem; color:var(--text-muted);">Chi tiết ${totalCount} lượt ghi nhận</span>
                        <button class="btn btn-slate" style="font-size:0.75rem; padding:6px 10px;" onclick='printSummaryReport(${JSON.stringify(fromDate)}, ${JSON.stringify(toDate)})'>📠 In báo cáo</button>
                    </div>
                    <div class="log-table-wrap">
                        <table class="log-report-table">
                            <thead><tr><th>STT</th><th>Ngày giờ</th><th>Mã TB</th><th>Chu kỳ</th><th>Người thực hiện</th><th>Kết quả</th><th>Ghi chú</th></tr></thead>
                            <tbody>${tableRows || '<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Không có dữ liệu trong khoảng thời gian này</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function printSummaryReport(fromDate, toDate) {
            const entries = collectLogsInRange(fromDate, toDate);
            const passCount = entries.filter(e => e.result === 'pass').length;
            const noteCount = entries.filter(e => e.result === 'note').length;
            const failCount = entries.filter(e => e.result === 'fail').length;
            const deviceSet = new Set(entries.map(e => e.itemCode));
            const totalDowntime = entries.reduce((sum, e) => sum + (parseInt(e.downtimeMinutes) || 0), 0);

            let tableRows = '';
            entries.forEach((e, idx) => {
                tableRows += `
                    <tr>
                        <td style="text-align:center;">${idx + 1}</td>
                        <td style="white-space:nowrap;">${e.performedAt}</td>
                        <td style="font-weight:bold;">${e.itemCode}</td>
                        <td>${e.cycleLabel || ''}</td>
                        <td>${(e.performedBy || '').replace(/</g,'&lt;')}</td>
                        <td style="text-align:center;">${resultLabel(e.result)}</td>
                        <td style="white-space:pre-wrap;">${(e.notes || '—').replace(/</g,'&lt;')}</td>
                    </tr>
                `;
            });

            const bodyHtml = `
                <p style="font-size:13px; margin-bottom:15px;">
                    <strong>Tổng lượt bảo trì:</strong> ${entries.length} &nbsp; | &nbsp;
                    <strong>Số thiết bị liên quan:</strong> ${deviceSet.size} &nbsp; | &nbsp;
                    <strong>Đạt:</strong> ${passCount} &nbsp; | &nbsp;
                    <strong>Có lưu ý:</strong> ${noteCount} &nbsp; | &nbsp;
                    <strong>Không đạt:</strong> ${failCount} &nbsp; | &nbsp;
                    <strong>Tổng thời gian dừng máy:</strong> ${totalDowntime} phút
                </p>
                <table>
                    <thead><tr><th style="width:4%;">STT</th><th style="width:12%;">Ngày giờ</th><th style="width:13%;">Mã TB</th><th style="width:12%;">Chu kỳ</th><th style="width:14%;">Người thực hiện</th><th style="width:8%;">Kết quả</th><th style="width:37%;">Ghi chú</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            `;
            const srLineInfo = getCompanyInfo().lineName;
            const srSubTitle = `${srLineInfo ? srLineInfo + '<br>' : ''}Khoảng thời gian: ${fromDate} → ${toDate}`;
            openPrintWindow('BÁO CÁO TỔNG HỢP KẾT QUẢ BẢO TRÌ', srSubTitle, bodyHtml);
        }

        // --- ĐÁNH SAO MỨC ĐỘ QUAN TRỌNG THIẾT BỊ (GHI TRỰC TIẾP VÀO CỘT A CỦA EXCEL) ---
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
        function renderDashboard() {
            const container = document.getElementById('dashboardContainer');
            if (currentFileIdx === -1 || allValidRows.length === 0) {
                container.innerHTML = `<div class="dashboard-empty">Vui lòng nạp dữ liệu ở tab "⚙️ Thiết bị" để xem thống kê Dashboard.</div>`;
                return;
            }

            let totalPower = 0;
            let totalCurrent = 0;
            let maintainedCount = 0;
            let overdueCount = 0;
            let neverMaintainedCount = 0;
            const overdueDevices = [];
            const importanceCount = { 3: 0, 2: 0, 1: 0, 0: 0 };
            const adhocStatusCounts = computeAdhocStatusCounts();

            allValidRows.forEach(device => {
                importanceCount[device.rate]++;
                let pVal = parseFloat(String(device.power || "").replace(/[^\d.]/g, ''));
                if (!isNaN(pVal)) totalPower += pVal;

                let cVal = parseFloat(String(device.current || "").replace(/[^\d.]/g, ''));
                if (!isNaN(cVal)) totalCurrent += cVal;

                const status = classifyDeviceMaintenance(device);
                if (status.hasAnyRecord) maintainedCount++;
                if (status.neverMaintained) neverMaintainedCount++;
                if (status.isOverdue) {
                    overdueCount++;
                    overdueDevices.push({ device, cycles: status.overdueCycles });
                }
            });

            let overdueListHtml = '';
            if (overdueDevices.length === 0) {
                overdueListHtml = `<div class="italic" style="color: var(--text-muted); font-size: 0.85rem; padding: 10px 0;">Không có thiết bị nào quá hạn bảo trì. 🎉</div>`;
            } else {
                overdueListHtml = '<div class="overdue-list">';
                overdueDevices.slice(0, 30).forEach(o => {
                    overdueListHtml += `
                        <div class="overdue-item">
                            <div class="overdue-item-name">
                                <strong>${o.device.item} — ${o.device.name}</strong>
                                <span>${o.device.cabinet ? 'Tủ: ' + o.device.cabinet : ''}</span>
                            </div>
                            <span class="overdue-item-badge">Quá hạn: ${o.cycles.join(', ')}</span>
                        </div>
                    `;
                });
                overdueListHtml += '</div>';
                if (overdueDevices.length > 30) {
                    overdueListHtml += `<div class="italic" style="color: var(--text-muted); font-size: 0.78rem; margin-top: 8px;">... và ${overdueDevices.length - 30} thiết bị quá hạn khác.</div>`;
                }
            }

            container.innerHTML = `
                <div class="dashboard-grid">
                    <div class="stat-card c-sky">
                        <div class="stat-icon">⚙️</div>
                        <div class="stat-label">Số lượng thiết bị</div>
                        <div class="stat-value">${allValidRows.length}</div>
                        <div class="stat-sub">Đang theo dõi trong tệp: ${loadedFiles[currentFileIdx].name}</div>
                    </div>
                    <div class="stat-card c-amber">
                        <div class="stat-icon">⚡</div>
                        <div class="stat-label">Tổng công suất</div>
                        <div class="stat-value">${totalPower.toLocaleString('vi-VN', {maximumFractionDigits: 1})} <span style="font-size:1rem;">kW</span></div>
                        <div class="stat-sub">Tổng công suất lắp đặt toàn hệ thống</div>
                    </div>
                    <div class="stat-card c-amber">
                        <div class="stat-icon">🔌</div>
                        <div class="stat-label">Tổng dòng điện</div>
                        <div class="stat-value">${totalCurrent.toLocaleString('vi-VN', {maximumFractionDigits: 1})} <span style="font-size:1rem;">A</span></div>
                        <div class="stat-sub">Tổng dòng định mức (In) toàn hệ thống</div>
                    </div>
                    <div class="stat-card c-emerald">
                        <div class="stat-icon">✅</div>
                        <div class="stat-label">Đã thực hiện bảo trì</div>
                        <div class="stat-value">${maintainedCount}</div>
                        <div class="stat-sub">Thiết bị có ít nhất 1 lần ghi nhận bảo trì</div>
                    </div>
                    <div class="stat-card c-rose">
                        <div class="stat-icon">⏰</div>
                        <div class="stat-label">Đã quá hạn bảo trì</div>
                        <div class="stat-value">${overdueCount}</div>
                        <div class="stat-sub">Vượt mốc chu kỳ bảo trì tính đến hôm nay</div>
                    </div>
                    <div class="stat-card" style="border-left-color:#64748b;">
                        <div class="stat-icon">📭</div>
                        <div class="stat-label">Chưa bảo trì lần nào</div>
                        <div class="stat-value">${neverMaintainedCount}</div>
                        <div class="stat-sub">Thiết bị chưa có bất kỳ mốc bảo trì nào</div>
                    </div>
                </div>

                <div class="dashboard-section-title">⭐ Thiết bị theo mức độ quan trọng</div>
                <div class="dashboard-grid">
                    <div class="stat-card c-rose">
                        <div class="stat-icon">★★★</div>
                        <div class="stat-label">Rất quan trọng</div>
                        <div class="stat-value">${importanceCount[3]}</div>
                        <div class="stat-sub">Thiết bị được đánh dấu ★★★</div>
                    </div>
                    <div class="stat-card c-amber">
                        <div class="stat-icon">★★</div>
                        <div class="stat-label">Quan trọng</div>
                        <div class="stat-value">${importanceCount[2]}</div>
                        <div class="stat-sub">Thiết bị được đánh dấu ★★</div>
                    </div>
                    <div class="stat-card c-sky">
                        <div class="stat-icon">★</div>
                        <div class="stat-label">Ít quan trọng</div>
                        <div class="stat-value">${importanceCount[1]}</div>
                        <div class="stat-sub">Thiết bị được đánh dấu ★</div>
                    </div>
                    <div class="stat-card" style="border-left-color:#64748b;">
                        <div class="stat-icon">–</div>
                        <div class="stat-label">Chưa đánh giá</div>
                        <div class="stat-value">${importanceCount[0]}</div>
                        <div class="stat-sub">Chưa được gắn mức độ quan trọng</div>
                    </div>
                </div>

                <div class="dashboard-section-title">🔧 Trạng thái công việc bảo trì đột xuất</div>
                <div class="dashboard-grid">
                    <div class="stat-card" style="border-left-color:#64748b;">
                        <div class="stat-icon">🕓</div>
                        <div class="stat-label">Chưa lên lịch</div>
                        <div class="stat-value">${adhocStatusCounts.unscheduled}</div>
                        <div class="stat-sub">Công việc đột xuất chưa chọn khung giờ</div>
                    </div>
                    <div class="stat-card c-sky">
                        <div class="stat-icon">▶️</div>
                        <div class="stat-label">Đang thực hiện</div>
                        <div class="stat-value">${adhocStatusCounts.in_progress}</div>
                        <div class="stat-sub">Đã lên lịch và đến ngày thực hiện</div>
                    </div>
                    <div class="stat-card c-amber">
                        <div class="stat-icon">📦</div>
                        <div class="stat-label">Chờ vật tư</div>
                        <div class="stat-value">${adhocStatusCounts.waiting_materials}</div>
                        <div class="stat-sub">Đang chờ vật tư để tiếp tục thực hiện</div>
                    </div>
                </div>

                <div class="dashboard-section-title">📊 Thống kê bảo trì đột xuất theo thời gian &amp; khu vực</div>
                <div class="dashboard-split-2col">
                    <div class="dashboard-split-panel">
                        <div class="dashboard-split-subtitle">📅 Số lượt hoàn thành theo tháng</div>
                        ${renderSimpleBarChart(computeAdhocMonthlyStats(), {
                            sortByKey: true,
                            colors: ['#a855f7'],
                            formatLabel: (ym) => { const p = ym.split('-'); return p.length === 2 ? `Th.${p[1]}/${p[0]}` : ym; }
                        })}
                    </div>
                    <div class="dashboard-split-panel">
                        <div class="dashboard-split-subtitle">📍 Số lượt hoàn thành theo khu vực</div>
                        ${renderSimpleBarChart(computeAdhocAreaStats(), { limit: 12 })}
                    </div>
                </div>

                <div class="dashboard-section-title">⏰ Danh sách thiết bị quá hạn bảo trì</div>
                <div class="dashboard-split-panel">
                    ${overdueListHtml}
                </div>
            `;
        }

        // --- CÔNG THỨC TÍNH NGÀY KẾ HOẠCH ---
        function calculateNextDate(lastMaintStr, cycleVal, cycleType) {
            if (!lastMaintStr || lastMaintStr.toLowerCase() === 'chưa có' || lastMaintStr.trim() === '') {
                return 'Chưa có mốc';
            }
            try {
                let dateParts = [];
                if (lastMaintStr.includes('-')) {
                    dateParts = lastMaintStr.split('-');
                    if (dateParts[0].length !== 4) {
                        dateParts = [dateParts[2], dateParts[1], dateParts[0]]; // dd-mm-yyyy -> yyyy-mm-dd
                    }
                } else if (lastMaintStr.includes('/')) {
                    dateParts = lastMaintStr.split('/');
                    dateParts = [dateParts[2], dateParts[1], dateParts[0]]; // dd/mm/yyyy -> yyyy-mm-dd
                } else {
                    return 'Sai định dạng';
                }
                
                let date = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                if (isNaN(date.getTime())) return 'Sai định dạng';

                if (cycleType === 'day') {
                    date.setDate(date.getDate() + parseInt(cycleVal));
                } else if (cycleType === 'month') {
                    date.setMonth(date.getMonth() + parseInt(cycleVal));
                } else if (cycleType === 'year') {
                    date.setFullYear(date.getFullYear() + parseInt(cycleVal));
                }

                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${d}/${m}/${y}`;
            } catch(e) {
                return 'Lỗi ngày';
            }
        }

        // --- XÁC ĐỊNH TRẠNG THÁI MÀU CHO Ô NGÀY KẾ HOẠCH (QUÁ HẠN / CÒN HẠN) ---
        function getDateStatusClass(nextDateStr) {
            if (!nextDateStr || !nextDateStr.includes('/')) return '';
            const parts = nextDateStr.split('/');
            if (parts.length !== 3) return '';
            const nextDate = new Date(parts[2], parts[1] - 1, parts[0]);
            if (isNaN(nextDate.getTime())) return '';
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return nextDate < today ? 'overdue' : 'highlight';
        }

        // --- FORM CHỈNH SỬA THÔNG TIN THIẾT BỊ ---
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
        function addToPlan(rowIdx, type) {
            const file = loadedFiles[currentFileIdx];
            const struct = analyzeStructure(file.rows);
            const rawRow = file.rows[rowIdx];

            const exists = maintPlan.some(p => p.rowIdx === rowIdx && p.cycleType === type);
            if (exists) {
                alert("Chu kỳ bảo trì này đã có trong danh sách kế hoạch!");
                return;
            }

            let cycleLabel = '';
            let jobText = '';
            let cycleVal = 0;

            if (type === 'day') {
                cycleLabel = 'Bảo Trì Ngày';
                cycleVal = parseInt(rawRow[struct.day]);
                jobText = struct.jobday !== -1 ? rawRow[struct.jobday] : '';
            } else if (type === 'month') {
                cycleLabel = 'Bảo Trì Tháng';
                cycleVal = parseInt(rawRow[struct.month]);
                jobText = struct.jobmonth !== -1 ? rawRow[struct.jobmonth] : '';
            } else if (type === 'year') {
                cycleLabel = 'Bảo Trì Năm';
                cycleVal = parseInt(rawRow[struct.year]);
                jobText = struct.jobyear !== -1 ? rawRow[struct.jobyear] : '';
            }

            maintPlan.push({
                planId: Date.now() + Math.random().toString(36).substr(2, 5),
                rowIdx: rowIdx,
                item: rawRow[struct.item],
                name: rawRow[struct.name],
                area: struct.area !== -1 && rawRow[struct.area] ? String(rawRow[struct.area]).trim() : "",
                cycleType: type,
                cycleLabel: cycleLabel,
                cycleVal: cycleVal,
                jobText: jobText,
                scheduledDate: '',
                assignedTo: ''
            });

            savePlanToLocalStorage();
            renderMaintPlan();
        }

        function removeFromPlan(planId) {
            maintPlan = maintPlan.filter(p => p.planId !== planId);
            savePlanToLocalStorage();
            renderMaintPlan();
        }

        // Mục 8: cập nhật Ngày thực hiện (ngăn phải) cho hạng mục bảo trì theo chu kỳ
        function updateMaintScheduledDate(planId, value) {
            const planItem = maintPlan.find(p => p.planId === planId);
            if (!planItem) return;
            planItem.scheduledDate = value;
            savePlanToLocalStorage();
            renderMaintPlan();
        }

        // --- CẬP NHẬT NHANH NỘI DUNG CÔNG VIỆC (GHI ĐÈ TRỰC TIẾP VÀO DỮ LIỆU GỐC) ---
        function updateJobTextInline(planId, element) {
            const newText = element.innerText.trim();
            const planItem = maintPlan.find(p => p.planId === planId);
            if (!planItem) return;

            planItem.jobText = newText;
            savePlanToLocalStorage();

            // Ghi đè trực tiếp lên dữ liệu gốc của thiết bị (cột jobday/jobmonth/jobyear)
            if (currentFileIdx !== -1) {
                const file = loadedFiles[currentFileIdx];
                const struct = analyzeStructure(file.rows);
                const rawRow = file.rows[planItem.rowIdx];

                let targetJobCol = -1;
                if (planItem.cycleType === 'day') targetJobCol = struct.jobday;
                else if (planItem.cycleType === 'month') targetJobCol = struct.jobmonth;
                else if (planItem.cycleType === 'year') targetJobCol = struct.jobyear;

                if (targetJobCol !== -1 && rawRow) {
                    rawRow[targetJobCol] = newText;
                    setUnsavedFlag(true);

                    // Cập nhật lại allValidRows tương ứng để đồng bộ với Sơ đồ cây (không cần render lại toàn bộ cây)
                    const cachedDevice = allValidRows.find(d => d.rowIdx === planItem.rowIdx);
                    if (cachedDevice) {
                        if (planItem.cycleType === 'day') cachedDevice.jobday = newText;
                        else if (planItem.cycleType === 'month') cachedDevice.jobmonth = newText;
                        else if (planItem.cycleType === 'year') cachedDevice.jobyear = newText;
                    }
                }
            }

            // Hiệu ứng nhấp nháy báo đã lưu
            const hintEl = document.getElementById('jobhint_' + planId);
            if (hintEl) {
                hintEl.innerText = '✔ Đã lưu vào dữ liệu (nhớ bấm "Lưu dữ liệu" để ghi vào file Excel)';
                hintEl.classList.add('job-saved-flash');
                setTimeout(() => {
                    hintEl.innerText = '✎ Nhấp vào nội dung để chỉnh sửa nhanh';
                    hintEl.classList.remove('job-saved-flash');
                }, 2000);
            }
        }

        function renderMaintPlan() {
            if (maintPlan.length === 0) {
                planContainer.innerHTML = `
                    <div class="italic text-center p-20" style="color: var(--text-muted); margin-top: 50px;">
                        Chưa có thiết bị nào trong hàng chờ bảo dưỡng.<br>
                        Hãy chọn các chu kỳ bảo trì từ Sơ đồ cây bên trái để đưa vào kế hoạch!
                    </div>
                `;
                updatePlanActionButtons();
                renderMiniMaintPlan();
                return;
            }

            updatePlanActionButtons();
            let planHtml = '';

            maintPlan.forEach(p => {
                let badgeClass = 'badge-day';
                if (p.cycleType === 'month') badgeClass = 'badge-month';
                if (p.cycleType === 'year') badgeClass = 'badge-year';

                planHtml += `
                    <div class="plan-item-card">
                        <div class="plan-card-split">
                            <div class="plan-panel-left">
                                <input type="checkbox" class="checkbox-custom" onclick="event.preventDefault(); openCompleteLogModal('${p.planId}')" title="Đánh dấu hoàn tất và ghi nhật ký">
                                <div class="plan-item-info">
                                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                        <span class="plan-cycle-badge ${badgeClass}">${p.cycleLabel} (Chu kỳ: ${p.cycleVal})</span>
                                        ${p.scheduledDate ? `<span class="adhoc-status-badge adhoc-status-scheduled">📅 Đã lên lịch (${p.scheduledDate.split('-').reverse().join('/')})</span>` : `<span class="adhoc-status-badge adhoc-status-unscheduled">🕓 Chưa lên lịch</span>`}
                                    </div>
                                    <strong style="color: white; font-size:0.8rem; margin-top:3px;">${p.item}</strong>
                                    <span style="font-size:0.8rem; color:var(--color-emerald);">${p.name}</span>
                                    <div class="plan-job-desc" contenteditable="true"
                                         onblur="updateJobTextInline('${p.planId}', this)"
                                         onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault(); this.blur();}"
                                         title="Nhấp để chỉnh sửa nội dung công việc">${p.jobText ? p.jobText.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</div>
                                    <div class="job-edit-hint" id="jobhint_${p.planId}">✎ Nhấp vào nội dung để chỉnh sửa nhanh</div>
                                </div>
                            </div>
                            <div class="plan-panel-right">
                                <span class="plan-panel-right-label">📅 Ngày thực hiện</span>
                                <input type="date" class="plan-schedule-date-input" value="${p.scheduledDate || ''}" onchange="updateMaintScheduledDate('${p.planId}', this.value)">
                                <span class="plan-panel-right-label" style="margin-top:6px;">👤 Người thực hiện</span>
                                <select class="search-input" style="padding:5px 6px; font-size:0.78rem;" onchange="updatePlanAssignedTo('${p.planId}', this.value)">${personnelOptionsHtml(p.assignedTo)}</select>
                                <button type="button" class="btn btn-sky" style="margin-top:8px; padding:5px 8px; font-size:0.72rem;" onclick="createWorkOrderFromPlanItem('${p.planId}', 'cyclic')">📋 Giao việc (tạo lệnh CV)</button>
                            </div>
                        </div>
                        <button onclick="removeFromPlan('${p.planId}')" class="btn-remove-plan" title="Hủy bỏ">✖</button>
                    </div>
                `;
            });

            planContainer.innerHTML = planHtml;
            renderMiniMaintPlan();
        }

        // Danh sách RÚT GỌN (tab Thiết bị): chỉ khu vực/mã thiết bị + nút bỏ chọn
        function renderMiniMaintPlan() {
            const el = document.getElementById('miniPlanSubtabCyclic');
            if (!el) return;
            if (maintPlan.length === 0) {
                el.innerHTML = `
                    <div class="italic text-center p-20" style="color: var(--text-muted); margin-top: 30px;">
                        Chưa có thiết bị nào trong hàng chờ bảo dưỡng.<br>
                        Hãy chọn các chu kỳ bảo trì từ Sơ đồ cây bên trái để đưa vào kế hoạch!
                    </div>
                `;
                return;
            }
            let html = '';
            maintPlan.forEach(p => {
                html += `
                    <div class="mini-plan-item">
                        <div class="mini-plan-item-info">
                            ${p.area ? `<span class="mini-plan-item-area">📍 ${p.area}</span>` : ''}
                            <span class="mini-plan-item-name">${p.item}${p.name ? ' — ' + p.name : ''}</span>
                            <span class="mini-plan-item-sub">${p.cycleLabel} (Chu kỳ: ${p.cycleVal})</span>
                        </div>
                        <button onclick="removeFromPlan('${p.planId}')" class="btn-remove-plan" title="Bỏ chọn">✖</button>
                    </div>
                `;
            });
            el.innerHTML = html;
        }

        function completeAllPlan() {
            if (maintPlan.length === 0) return;
            if (currentFileIdx === -1) {
                alert("Vui lòng kích hoạt/nạp lại file dữ liệu trước!");
                return;
            }

            const performedBy = prompt(`Xác nhận hoàn tất toàn bộ ${maintPlan.length} hạng mục bảo trì hiện tại.\n\nVui lòng nhập tên người thực hiện (áp dụng chung cho toàn bộ hạng mục):`, "");
            if (performedBy === null) return; // Người dùng bấm Hủy
            if (!performedBy.trim()) {
                alert("Vui lòng nhập tên người thực hiện để tiếp tục.");
                return;
            }

            const timestamp = getCurrentTimestamp();

            maintPlan.forEach(item => {
                applyMaintenanceCompletion(item.rowIdx, item.cycleType, timestamp);
                addDeviceLogEntry(item.item, {
                    id: Date.now() + Math.random().toString(36).substr(2, 5),
                    performedAt: timestamp,
                    cycleType: item.cycleType,
                    cycleLabel: item.cycleLabel,
                    jobText: item.jobText || '',
                    materials: '',
                    performedBy: performedBy.trim(),
                    checkedBy: '',
                    result: 'pass',
                    downtimeMinutes: '',
                    notes: 'Hoàn thành theo kế hoạch (xử lý hàng loạt).',
                    recordedAt: timestamp
                });
                writeDeviceLogFile(item.item);
                woSyncLinkedOrderOnPlanComplete('cyclic', item.planId, { performedAt: timestamp, performedBy: performedBy.trim(), notes: 'Hoàn thành theo kế hoạch (xử lý hàng loạt).' });
            });

            setUnsavedFlag(true);
            maintPlan = [];
            savePlanToLocalStorage();
            processDataset();
            renderMaintPlan();
            alert("Đã hoàn thành hàng loạt kế hoạch kiểm tra và ghi nhận nhật ký cho từng thiết bị!");
        }


        // --- XUẤT PHIẾU BẢO TRÌ BẢN IN CHUẨN ĐỊNH DẠNG MỚI ---
        function printMaintenancePlan() {
            if (maintPlan.length === 0) {
                alert("Danh sách trống!");
                return;
            }
            
            const printWindow = window.open('', '_blank', 'width=950,height=650');
            let tableRows = '';
            maintPlan.forEach((p, idx) => {
                let cycleTypeFormatted = '';
                if (p.cycleType === 'day') cycleTypeFormatted = `Bảo trì ngày: ${p.cycleVal}`;
                else if (p.cycleType === 'month') cycleTypeFormatted = `Bảo trì tháng: ${p.cycleVal}`;
                else if (p.cycleType === 'year') cycleTypeFormatted = `Bảo trì năm: ${p.cycleVal}`;

                tableRows += `
                    <tr>
                        <td style="text-align: center; padding: 10px; border: 1px solid #000; font-size: 11px;">${idx + 1}</td>
                        <td style="text-align: center; padding: 10px; border: 1px solid #000; font-size: 11px; font-weight: bold;">${p.item}</td>
                        <td style="text-align: center; padding: 10px; border: 1px solid #000; font-size: 11px;">${p.name}</td>
                        <td style="text-align: center; padding: 10px; border: 1px solid #000; font-size: 11px; text-transform: uppercase; font-weight: bold; color: #111;">${cycleTypeFormatted}</td>
                        <td style="text-align: left; padding: 10px; border: 1px solid #000; font-size: 11px; white-space: pre-wrap;">${p.jobText || 'Theo hướng dẫn kỹ thuật phòng KTCL'}</td>
                        <td style="text-align: center; padding: 10px; border: 1px solid #000; font-size: 11px;">${p.scheduledDate ? p.scheduledDate.split('-').reverse().join('/') : '—'}</td>
                        <td style="text-align: center; padding: 10px; border: 1px solid #000; font-size: 11px;">${p.assignedTo || '—'}</td>
                        <td style="border: 1px solid #000; text-align: left; padding: 10px; font-size: 11px; font-weight: bold;">[  ] Đạt <br><br> [  ] Không đạt</td>
                    </tr>
                `;
            });
            
            const htmlContent = `
                <html>
                <head>
                    <title>Phiếu Bảo Trì Định Kỳ - MDF VRG Quảng Trị</title>
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 30px; color: #000; background: #fff; line-height: 1.4; }
                        .header-print { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 25px; }
                        h2 { text-align: center; margin-bottom: 5px; text-transform: uppercase; font-size: 21px; font-weight: 800; letter-spacing: 0.5px; }
                        .line-mdf { text-align: center; font-size: 13px; font-style: italic; margin-bottom: 25px; color: #333; font-weight: bold; }
                        table { width: 100%; border-collapse: collapse; margin-top: 15px; table-layout: fixed; }
                        th { background-color: #f5f5f5; padding: 10px; border: 1px solid #000; font-weight: bold; font-size: 12px; text-transform: uppercase; word-wrap: break-word; }
                        td { word-wrap: break-word; overflow-wrap: break-word; }
                        .footer-sig { margin-top: 50px; display: flex; justify-content: space-between; page-break-inside: avoid; }
                        .sig-box { width: 240px; text-align: center; font-size: 13px; }
                        @media print {
                            button { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header-print">
                        <div>
                            <strong style="font-size: 13px;">CÔNG TY CỔ PHẦN GỖ MDF VRG QUẢNG TRỊ</strong><br>
                            <span style="font-size: 12px; font-weight: 600;">Phòng Kỹ thuật Chất lượng</span>
                        </div>
                        <div style="text-align: right; font-size: 12px; font-weight: 600;">
                            Ngày: ${new Date().toLocaleDateString('vi-VN')}<br>
                            Giờ lập phiếu: ${new Date().toLocaleTimeString('vi-VN')}
                        </div>
                    </div>
                    
                    <h2>PHIẾU BẢO TRÌ ĐỊNH KỲ</h2>
                    <div class="line-mdf">Dây chuyền: MDF 2</div>
                    
                    <button onclick="window.print()" style="padding: 10px 20px; background: #059669; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-bottom: 15px; font-size: 12px;">📠 Thực hiện in phiếu ra giấy</button>
                    
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 4%;">STT</th>
                                <th style="width: 11%;">Mã Thiết Bị</th>
                                <th style="width: 13%;">Chức năng</th>
                                <th style="width: 10%;">Chu kỳ</th>
                                <th style="width: 32%;">Nội dung công việc</th>
                                <th style="width: 10%;">Ngày thực hiện</th>
                                <th style="width: 11%;">Người thực hiện</th>
                                <th style="width: 9%;">Kết quả</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                    
                    <div class="footer-sig">
                        <div class="sig-box">
                            <p><strong>Người thực hiện</strong></p>
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
                            <span style="font-size:11px; color:#555;">(Phê duyệt hoàn thành)</span>
                            <br><br><br><br><br>
                            <p>.......................................</p>
                        </div>
                    </div>
                </body>
                </html>
            `;
            
            printWindow.document.write(htmlContent);
            printWindow.document.close();
        }

        // --- GHI ĐÈ TRỰC TIẾP HOẶC TẢI XUỐNG DỰ PHÒNG ---
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

        function getCurrentTimestamp() {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const h = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            return `${y}-${m}-${d} ${h}:${min}`;
        }

        // ==================================================================
        // ====================  RCA: PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ  =========
        // ==================================================================

        function rcaEsc(v) {
            return String(v === undefined || v === null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        }

        // ---------------------------------------------------------------
        // Các module RCA, FMEA, Work Order đã được tách ra file riêng:
        // xem rca.js, fmea.js, workorder.js (load ngay sau app.js trong index.html)
        // ---------------------------------------------------------------

        // ================================================================
        // ==========  CẤU HÌNH ONLINE: GOOGLE DRIVE & GEMINI AI  ==========
        // ================================================================

        // ---------- LƯU / NẠP CẤU HÌNH TỪ LOCALSTORAGE ----------
        function loadAppConfigFromStorage() {
            // Client ID đã khoá cứng ở DRIVE_OAUTH_CLIENT_ID, không đọc/ghi localStorage nữa.
            driveClientId = DRIVE_OAUTH_CLIENT_ID;
            geminiApiKey = localStorage.getItem('cfg_geminiApiKey') || '';
            geminiModelMode = localStorage.getItem('cfg_geminiModelMode') || 'auto';
            geminiModel = localStorage.getItem('cfg_geminiModel') || 'gemini-3-flash-preview';
            updateChatbotStatus(geminiApiKey ? 'ready' : 'unconfigured');

            // Dựng dropdown chọn dự án từ DRIVE_PROJECT_FOLDERS
            const selectEl = document.getElementById('cfg_driveFolderSelect');
            if (selectEl && selectEl.options.length === 0) {
                DRIVE_PROJECT_FOLDERS.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.folderId;
                    opt.textContent = p.name;
                    selectEl.appendChild(opt);
                });
            }
            const savedFolderId = localStorage.getItem('cfg_driveFolderId') || '';
            const matched = DRIVE_PROJECT_FOLDERS.find(p => p.folderId === savedFolderId);
            driveFolderId = matched ? matched.folderId : (DRIVE_PROJECT_FOLDERS[0]?.folderId || '');
            if (selectEl) selectEl.value = driveFolderId;

            const elGeminiKey = document.getElementById('cfg_geminiApiKey');
            const elGeminiModel = document.getElementById('cfg_geminiModel');
            if (elGeminiKey) elGeminiKey.value = geminiApiKey;
            if (elGeminiModel) elGeminiModel.value = geminiModelMode;

            const loginStatusEl = document.getElementById('driveLoginStatus');
            if (loginStatusEl) loginStatusEl.textContent = '⚪ Chưa đăng nhập Google.';
            const folderBadgeEl = document.getElementById('cfg_driveFolderStatus');
            if (folderBadgeEl) folderBadgeEl.textContent = '⚪ Chưa kích hoạt';

            const geminiStatusEl = document.getElementById('geminiConnectStatus');
            if (geminiStatusEl) {
                geminiStatusEl.innerHTML = geminiApiKey
                    ? `⚪ Đã lưu Gemini API Key (model: <strong>${geminiModel}</strong>). Bấm "✅ Kiểm tra kết nối" để xác nhận, hoặc dùng ngay nút 💬 góc dưới màn hình.`
                    : 'Chưa cấu hình Gemini API.';
            }
        }

        // Đọc dự án đang chọn ở dropdown, lưu lại lựa chọn cho lần sau
        function readSelectedDriveFolder() {
            const selectEl = document.getElementById('cfg_driveFolderSelect');
            driveFolderId = selectEl?.value || DRIVE_PROJECT_FOLDERS[0]?.folderId || '';
            localStorage.setItem('cfg_driveFolderId', driveFolderId);
            return driveFolderId;
        }

        function saveGeminiConfig() {
            geminiApiKey = document.getElementById('cfg_geminiApiKey')?.value.trim() || '';
            geminiModelMode = document.getElementById('cfg_geminiModel')?.value || 'auto';
            localStorage.setItem('cfg_geminiApiKey', geminiApiKey);
            localStorage.setItem('cfg_geminiModelMode', geminiModelMode);
            if (geminiModelMode !== 'auto') {
                geminiModel = geminiModelMode; // Người dùng chọn cố định 1 model, không dò tự động nữa
                localStorage.setItem('cfg_geminiModel', geminiModel);
            }
            const statusEl = document.getElementById('geminiConnectStatus');
            if (!geminiApiKey) {
                if (statusEl) statusEl.textContent = 'Vui lòng nhập Gemini API Key.';
                updateChatbotStatus('unconfigured');
                return;
            }
            const modelLabel = geminiModelMode === 'auto' ? 'tự động dò model khả dụng' : geminiModelMode;
            if (statusEl) statusEl.innerHTML = `💾 Đã lưu cấu hình Gemini (${modelLabel}). Bấm "✅ Kiểm tra kết nối" để xác nhận hoạt động.`;
            updateChatbotStatus('ready');
        }

        async function testGeminiConnection() {
            if (!geminiApiKey) { alert('Vui lòng nhập và lưu Gemini API Key trước!'); return; }
            const statusEl = document.getElementById('geminiConnectStatus');
            if (statusEl) statusEl.innerHTML = geminiModelMode === 'auto' ? '⏳ Đang dò model Gemini khả dụng...' : '⏳ Đang kiểm tra kết nối...';
            updateChatbotStatus('typing');
            try {
                const reply = await callGeminiAPI([{ role: 'user', text: 'Xin chào, hãy trả lời ngắn gọn "Kết nối thành công" bằng tiếng Việt.' }]);
                if (statusEl) statusEl.innerHTML = `🟢 Kết nối thành công (model: <strong>${geminiModel}</strong>)! Phản hồi mẫu: <em>${rcaEsc(reply.slice(0, 150))}</em>`;
                updateChatbotStatus('ready', geminiModel);
            } catch (err) {
                if (statusEl) statusEl.innerHTML = `🔴 Lỗi kết nối: ${rcaEsc(err.message)}`;
                updateChatbotStatus('error', err.message);
            }
        }

        // ---------- GEMINI API ----------
        async function callGeminiModelOnce(modelId, contents, systemInstructionText) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
            const body = { contents, systemInstruction: { parts: [{ text: systemInstructionText }] } };
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => null);
                throw new Error(errData?.error?.message || `HTTP ${res.status}`);
            }
            const data = await res.json();
            return data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '(Không có phản hồi)';
        }

        async function callGeminiAPI(messages) {
            const contents = messages.map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] }));
            const sys = 'Bạn là trợ lý AI tiếng Việt cho hệ thống quản lý bảo trì nhà máy (CMMS). Trả lời ngắn gọn, thực tế, đúng trọng tâm, ưu tiên tiếng Việt trừ khi được hỏi bằng ngôn ngữ khác.';

            if (geminiModelMode !== 'auto') {
                return await callGeminiModelOnce(geminiModelMode, contents, sys);
            }

            // Chế độ tự động: ưu tiên thử model đã từng hoạt động (nếu có) để trả lời nhanh, nếu lỗi mới dò lần lượt các model còn lại
            const tryOrder = geminiModel && GEMINI_CANDIDATE_MODELS.includes(geminiModel)
                ? [geminiModel, ...GEMINI_CANDIDATE_MODELS.filter(m => m !== geminiModel)]
                : GEMINI_CANDIDATE_MODELS;
            let lastErr = null;
            for (const modelId of tryOrder) {
                try {
                    const text = await callGeminiModelOnce(modelId, contents, sys);
                    if (modelId !== geminiModel) {
                        geminiModel = modelId;
                        localStorage.setItem('cfg_geminiModel', geminiModel);
                    }
                    return text;
                } catch (err) {
                    lastErr = err;
                }
            }
            throw lastErr || new Error('Không có model Gemini nào trong danh sách hoạt động được với API Key này.');
        }

        // ---------- CHATBOT: GIAO DIỆN WIDGET NỔI ----------
        // ---------- CHATBOT: TRẠNG THÁI (chấm màu trên nút nổi + dòng chữ trong panel) ----------
        function updateChatbotStatus(state, detail) {
            const dot = document.getElementById('chatbotStatusDot');
            const txt = document.getElementById('chatbotStatusText');
            if (!dot || !txt) return;
            dot.classList.remove('st-ready', 'st-typing', 'st-error');
            switch (state) {
                case 'ready':
                    dot.classList.add('st-ready');
                    txt.textContent = '🟢 Sẵn sàng' + (detail ? ` (${detail})` : '');
                    break;
                case 'typing':
                    dot.classList.add('st-typing');
                    txt.textContent = '🟡 Đang trả lời...';
                    break;
                case 'error':
                    dot.classList.add('st-error');
                    txt.textContent = '🔴 Lỗi' + (detail ? `: ${detail}` : '');
                    break;
                default: // 'unconfigured'
                    txt.textContent = '⚪ Chưa cấu hình';
            }
        }

        function toggleChatbotPanel() {
            const panel = document.getElementById('chatbotPanel');
            if (!panel) return;
            panel.classList.toggle('hidden');
            if (!panel.classList.contains('hidden')) {
                setTimeout(() => document.getElementById('chatbotInput')?.focus(), 100);
            }
        }

        function clearChatbotHistory() {
            if (chatbotHistory.length > 0 && !confirm('Xóa toàn bộ hội thoại hiện tại?')) return;
            chatbotHistory = [];
            const box = document.getElementById('chatbotMessages');
            if (box) box.innerHTML = `<div class="chatbot-msg chatbot-msg-bot">Xin chào 👋 Tôi là trợ lý AI của hệ thống CMMS. Bạn có thể hỏi tôi về bảo trì thiết bị, cách dùng hệ thống, hoặc bất kỳ điều gì cần hỗ trợ.</div>`;
        }

        function appendChatbotMessage(role, text) {
            const box = document.getElementById('chatbotMessages');
            if (!box) return null;
            const div = document.createElement('div');
            div.className = `chatbot-msg ${role === 'user' ? 'chatbot-msg-user' : (role === 'error' ? 'chatbot-msg-error' : 'chatbot-msg-bot')}`;
            div.textContent = text;
            box.appendChild(div);
            box.scrollTop = box.scrollHeight;
            return div;
        }

        async function sendChatbotMessage() {
            const input = document.getElementById('chatbotInput');
            if (!input) return;
            const text = input.value.trim();
            if (!text) return;

            if (!geminiApiKey) {
                appendChatbotMessage('bot', 'Vui lòng cấu hình Gemini API Key trong tab "⚙️ Cấu hình" trước khi sử dụng trợ lý AI.');
                return;
            }

            input.value = '';
            appendChatbotMessage('user', text);
            chatbotHistory.push({ role: 'user', text });

            const box = document.getElementById('chatbotMessages');
            const typingDiv = document.createElement('div');
            typingDiv.className = 'chatbot-msg chatbot-msg-typing';
            typingDiv.textContent = 'Trợ lý đang soạn trả lời...';
            box.appendChild(typingDiv);
            box.scrollTop = box.scrollHeight;
            updateChatbotStatus('typing');

            try {
                const reply = await callGeminiAPI(chatbotHistory);
                typingDiv.remove();
                appendChatbotMessage('bot', reply);
                chatbotHistory.push({ role: 'model', text: reply });
                updateChatbotStatus('ready', geminiModel);
            } catch (err) {
                typingDiv.remove();
                appendChatbotMessage('error', 'Lỗi: ' + err.message);
                updateChatbotStatus('error', err.message);
            }
        }

        // ---------- GOOGLE DRIVE: OAUTH ----------
        // ---------- MÀN HÌNH ĐĂNG NHẬP / CHỌN DỰ ÁN ĐẦU TIÊN (GATE) ----------
        function gateConnectGoogle() {
            connectGoogleDrive(); // Dùng lại đúng luồng OAuth đã có ở tab Cấu hình
        }

        function populateGateFolderSelect() {
            const gateSelect = document.getElementById('authGateFolderSelect');
            const cfgSelect = document.getElementById('cfg_driveFolderSelect');
            if (gateSelect && cfgSelect) gateSelect.innerHTML = cfgSelect.innerHTML;
        }

        function gateActivateProject() {
            // Đồng bộ lựa chọn từ màn hình gate sang dropdown ở tab Cấu hình,
            // rồi gọi lại đúng hàm kích hoạt dự án đã có sẵn (activateGoogleDriveProject sẽ đọc từ đó).
            const gateSelect = document.getElementById('authGateFolderSelect');
            const cfgSelect = document.getElementById('cfg_driveFolderSelect');
            if (gateSelect && cfgSelect) cfgSelect.value = gateSelect.value;

            const gateStatus = document.getElementById('authGateActivateStatus');
            if (gateStatus) gateStatus.textContent = '⏳ Đang kích hoạt thư mục dự án...';

            activateGoogleDriveProject();
        }

        // Bỏ qua đăng nhập, làm việc offline (chế độ cũ dùng ổ cứng cục bộ / tải file thủ công)
        function gateSkipToOffline() {
            document.body.classList.add('authenticated');
            document.getElementById('authGateScreen')?.remove();
        }

        function connectGoogleDrive() {
            driveClientId = DRIVE_OAUTH_CLIENT_ID;
            readSelectedDriveFolder();

            if (!driveClientId) { alert('Chưa cấu hình Google OAuth Client ID trong hệ thống (DRIVE_OAUTH_CLIENT_ID).'); return; }
            if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
                alert('Không tải được thư viện đăng nhập Google (Google Identity Services). Vui lòng kiểm tra kết nối Internet rồi thử lại.');
                return;
            }
            const loginStatusEl = document.getElementById('driveLoginStatus');
            if (loginStatusEl) loginStatusEl.textContent = '⏳ Đang mở cửa sổ đăng nhập Google...';

            try {
                driveTokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: driveClientId,
                    scope: 'https://www.googleapis.com/auth/drive email profile',
                    callback: async (tokenResponse) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            driveAccessToken = tokenResponse.access_token;
                            try {
                                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                    headers: { 'Authorization': 'Bearer ' + driveAccessToken }
                                });
                                if (res.ok) {
                                    const info = await res.json();
                                    driveUserEmail = info.email || '';
                                    driveUserName = info.name || '';
                                }
                            } catch (e) { /* không chặn luồng nếu lấy thông tin tài khoản thất bại */ }
                            if (loginStatusEl) {
                                const displayName = driveUserName || driveUserEmail || 'tài khoản Google';
                                loginStatusEl.innerHTML = `🟢 Đăng nhập thành công: <strong>${displayName}</strong>${driveUserEmail && driveUserName ? ' (' + driveUserEmail + ')' : ''}`;
                            }
                            updateHeaderUserStatus();

                            // Cập nhật màn hình gate (nếu đang hiển thị): chuyển sang bước chọn dự án
                            const gateStatus = document.getElementById('authGateLoginStatus');
                            if (gateStatus) {
                                const displayName = driveUserName || driveUserEmail || 'tài khoản Google';
                                gateStatus.innerHTML = `🟢 Xin chào, <strong>${displayName}</strong>`;
                            }
                            document.getElementById('authStep1')?.classList.add('hidden');
                            document.getElementById('authStep2')?.classList.remove('hidden');
                            populateGateFolderSelect();
                        } else {
                            if (loginStatusEl) loginStatusEl.textContent = '🔴 Đăng nhập thất bại hoặc bị hủy.';
                            const gateStatus = document.getElementById('authGateLoginStatus');
                            if (gateStatus) gateStatus.textContent = '🔴 Đăng nhập thất bại hoặc bị hủy.';
                        }
                    }
                });
                driveTokenClient.requestAccessToken({ prompt: '' });
            } catch (err) {
                if (loginStatusEl) loginStatusEl.textContent = `🔴 Lỗi khởi tạo đăng nhập: ${err.message}`;
            }
        }

        // Cập nhật 2 dòng trạng thái trên header: tài khoản đăng nhập + trạng thái mạng/Drive (thay cho nút "Lưu dữ liệu" cũ)
        function updateHeaderUserStatus() {
            const accEl = document.getElementById('headerUserAccount');
            const netEl = document.getElementById('headerUserNetStatus');
            if (!accEl || !netEl) return;

            // Dòng 1: tài khoản đăng nhập
            if (!driveAccessToken) {
                accEl.textContent = '⚪ Chưa đăng nhập';
            } else {
                const displayName = driveUserName || driveUserEmail || 'Google';
                accEl.innerHTML = `👤 <strong>${displayName}</strong>`;
            }

            // Dòng 2: trạng thái mạng thật + trạng thái Drive
            if (!navigator.onLine) {
                netEl.innerHTML = '🔴 Mất mạng';
                netEl.style.color = 'var(--color-rose)';
            } else if (driveAccessToken && appMode === 'drive' && driveActiveFolderId) {
                netEl.innerHTML = '🟢 Online';
                netEl.style.color = 'var(--color-emerald)';
            } else if (driveAccessToken) {
                netEl.innerHTML = '🟡 Chưa kích hoạt dự án';
                netEl.style.color = 'var(--color-amber)';
            } else {
                netEl.innerHTML = '🌐 Có mạng';
                netEl.style.color = 'var(--text-muted)';
            }
        }

        // Theo dõi mất/có mạng thật của trình duyệt — tự cập nhật ngay, không cần đợi người dùng thao tác
        window.addEventListener('online', updateHeaderUserStatus);
        window.addEventListener('offline', updateHeaderUserStatus);

        // Khi người dùng đổi lựa chọn dự án ở dropdown mà chưa bấm Kích hoạt lại
        function onDriveFolderSelectChange() {
            const selectEl = document.getElementById('cfg_driveFolderSelect');
            const badgeEl = document.getElementById('cfg_driveFolderStatus');
            const newVal = selectEl?.value || '';
            if (badgeEl) {
                badgeEl.textContent = (newVal && newVal === driveActiveFolderId) ? '🟢 Đã kích hoạt' : '⚪ Chưa kích hoạt';
            }
            const driveStatusEl = document.getElementById('driveConnectStatus');
            if (driveStatusEl && newVal !== driveActiveFolderId) driveStatusEl.innerHTML = '';
        }

        // ---------- GOOGLE DRIVE: HÀM GỌI API DÙNG CHUNG ----------
        async function driveApiFetch(url, options) {
            if (!driveAccessToken) throw new Error('Chưa đăng nhập Google Drive. Vui lòng bấm "🔗 Kết nối Google Drive" trước.');
            options = options || {};
            options.headers = Object.assign({ 'Authorization': 'Bearer ' + driveAccessToken }, options.headers || {});
            const res = await fetch(url, options);
            if (res.status === 401) {
                throw new Error('Phiên đăng nhập Google Drive đã hết hạn. Vui lòng bấm "🔗 Kết nối Google Drive" để đăng nhập lại.');
            }
            return res;
        }

        async function driveFindOrCreateFolder(parentId, name) {
            const q = `'${parentId}' in parents and name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            const res = await driveApiFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
            const data = await res.json();
            if (data.files && data.files.length > 0) return data.files[0].id;

            const createRes = await driveApiFetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
            });
            const created = await createRes.json();
            return created.id;
        }

        async function driveListFilesInFolder(folderId) {
            const q = `'${folderId}' in parents and trashed=false`;
            const res = await driveApiFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=200`);
            const data = await res.json();
            return data.files || [];
        }

        async function driveFindFileByName(folderId, name) {
            const q = `'${folderId}' in parents and name='${name.replace(/'/g, "\\'")}' and trashed=false`;
            const res = await driveApiFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
            const data = await res.json();
            return (data.files && data.files[0]) || null;
        }

        async function driveDownloadFileBlob(fileId, mimeType) {
            // File Google Sheets "gốc" (tạo/lưu trực tiếp trên Drive, không phải .xlsx thật) không hỗ trợ tải
            // trực tiếp bằng alt=media — phải dùng endpoint export để chuyển sang định dạng xlsx trước.
            const url = mimeType === 'application/vnd.google-apps.spreadsheet'
                ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}`
                : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
            const res = await driveApiFetch(url);
            if (!res.ok) throw new Error('Không tải được file từ Drive (HTTP ' + res.status + ')');
            return await res.blob();
        }

        // Tạo mới hoặc ghi đè (upload) 1 file trong Drive — multipart upload (hỗ trợ cả text CSV lẫn nhị phân xlsx)
        async function driveUploadFile(folderId, filename, content, mimeType, existingFileId) {
            const metadata = { name: filename, mimeType };
            if (!existingFileId) metadata.parents = [folderId];

            const boundary = '-------cmwsBoundary' + Date.now();
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelim = `\r\n--${boundary}--`;
            const isBinary = content instanceof ArrayBuffer || content instanceof Uint8Array;

            let bodyParts = [
                delimiter,
                'Content-Type: application/json; charset=UTF-8\r\n\r\n',
                JSON.stringify(metadata),
                delimiter,
                `Content-Type: ${mimeType}\r\n`
            ];

            let multipartBody;
            if (isBinary) {
                const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                const base64Data = btoa(binary);
                multipartBody = bodyParts.join('') + 'Content-Transfer-Encoding: base64\r\n\r\n' + base64Data + closeDelim;
            } else {
                multipartBody = bodyParts.join('') + '\r\n' + content + closeDelim;
            }

            const url = existingFileId
                ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
                : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

            const res = await driveApiFetch(url, {
                method: existingFileId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                body: multipartBody
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => null);
                throw new Error(errData?.error?.message || `Lỗi tải file lên Drive (HTTP ${res.status})`);
            }
            return await res.json();
        }

        // ---------- GOOGLE DRIVE: GHI / ĐỌC FILE JSON DÙNG CHUNG (cho các module dữ liệu phụ) ----------
        async function driveSyncJsonFile(folderId, filename, dataObj) {
            if (!folderId) return;
            try {
                const existing = await driveFindFileByName(folderId, filename);
                await driveUploadFile(folderId, filename, JSON.stringify(dataObj), 'application/json', existing ? existing.id : null);
            } catch (err) {
                console.error(`Lỗi ghi "${filename}" lên Google Drive:`, err);
            }
        }

        async function driveLoadJsonFile(folderId, filename) {
            if (!folderId) return null;
            try {
                const existing = await driveFindFileByName(folderId, filename);
                if (!existing) return null;
                const blob = await driveDownloadFileBlob(existing.id);
                const text = (await blob.text()).replace(/^\uFEFF/, '');
                if (!text.trim()) return null;
                return JSON.parse(text);
            } catch (err) {
                console.error(`Lỗi đọc "${filename}" từ Google Drive:`, err);
                return null;
            }
        }

        // Ngắt kết nối Drive: quay lại chế độ làm việc offline (ổ cứng cục bộ), không xóa cấu hình đã lưu
        function disconnectGoogleDrive() {
            if (appMode !== 'drive' && !driveAccessToken) {
                alert('Hiện chưa kết nối Google Drive.');
                return;
            }
            if (!confirm('Ngắt kết nối Google Drive và chuyển về chế độ offline (ổ cứng cục bộ)?\nDữ liệu đang mở trong phiên làm việc này sẽ được giữ nguyên, chỉ đổi nơi lưu khi bấm "Lưu dữ liệu" tiếp theo.')) return;

            appMode = 'local';
            driveAccessToken = '';
            driveTokenClient = null;
            driveUserEmail = '';
            driveUserName = '';
            driveActiveFolderId = '';
            driveDataFolderId = '';
            driveLogFolderId = '';
            driveTechnicianFolderId = '';
            driveMaintPlanFolderId = '';
            driveAdhocPlanFolderId = '';
            driveAdhocCampaignFolderId = '';
            driveCompanyInfoFolderId = '';
            driveRcaFolderId = '';
            driveWorkOrdersFolderId = '';
            driveFmeaFolderId = '';

            const loginStatusEl = document.getElementById('driveLoginStatus');
            if (loginStatusEl) loginStatusEl.textContent = '⚪ Chưa đăng nhập Google.';
            const badgeEl = document.getElementById('cfg_driveFolderStatus');
            if (badgeEl) badgeEl.textContent = '⚪ Chưa kích hoạt';

            const statusEl = document.getElementById('driveConnectStatus');
            if (statusEl) statusEl.innerHTML = '⚪ Đã ngắt kết nối Google Drive. Hệ thống đang ở chế độ offline (ổ cứng cục bộ).';

            const titleEl = document.getElementById('fileListSectionTitle');
            if (titleEl && loadedFiles.length > 0) titleEl.textContent = '📄 Tệp dữ liệu đang mở';

            updateLogDirStatusUI(!!logDirHandle, logDirHandle ? logDirHandle.name : '');
            updatePersonnelDirStatusUI(!!technicianDirHandle, technicianDirHandle ? technicianDirHandle.name : '');
            updateHeaderUserStatus();
        }

        // ---------- GOOGLE DRIVE: KÍCH HOẠT THƯ MỤC DỰ ÁN (data / logdata / technician) ----------
        async function activateGoogleDriveProject() {
            const statusEl = document.getElementById('driveConnectStatus');
            const badgeEl = document.getElementById('cfg_driveFolderStatus');
            readSelectedDriveFolder();
            const gateStatusEarly = document.getElementById('authGateActivateStatus');
            if (!driveAccessToken) {
                if (gateStatusEarly) gateStatusEarly.textContent = '🔴 Chưa đăng nhập Google.';
                alert('Vui lòng bấm "🔗 Đăng nhập bằng Google" trước!');
                return;
            }
            if (!driveFolderId) {
                if (gateStatusEarly) gateStatusEarly.textContent = '🔴 Chưa chọn dự án / thư mục Google Drive.';
                alert('Vui lòng chọn dự án / thư mục Google Drive trước!');
                return;
            }
            if (statusEl) statusEl.innerHTML = '⏳ Đang kích hoạt thư mục dự án trên Google Drive...';
            if (badgeEl) badgeEl.textContent = '⏳ Đang kích hoạt...';

            try {
                const rootRes = await driveApiFetch(`https://www.googleapis.com/drive/v3/files/${driveFolderId}?fields=id,name`);
                if (!rootRes.ok) throw new Error('Không truy cập được Folder ID đã nhập (kiểm tra lại ID hoặc quyền chia sẻ).');
                const rootInfo = await rootRes.json();

                // 1. Thư mục con "data" — file Excel dữ liệu (chấp nhận cả .xlsx/.xls thật lẫn Google Sheets gốc)
                driveDataFolderId = await driveFindOrCreateFolder(driveFolderId, 'data');
                const filesInData = await driveListFilesInFolder(driveDataFolderId);
                const validExcel = filesInData.filter(f =>
                    /\.(xlsx|xls)$/i.test(f.name) || f.mimeType === 'application/vnd.google-apps.spreadsheet'
                );

                if (validExcel.length === 0) {
                    const msg = `Đã kết nối thư mục "${rootInfo.name}" nhưng chưa có file Excel nào trong thư mục con "data" trên Drive. Vui lòng tải file dữ liệu (.xlsx) lên đó rồi thử kích hoạt lại.`;
                    if (statusEl) statusEl.innerHTML = `⚠️ ${msg}`;
                    if (badgeEl) badgeEl.textContent = '⚪ Chưa kích hoạt';
                    const gateStatus = document.getElementById('authGateActivateStatus');
                    if (gateStatus) gateStatus.textContent = `⚠️ ${msg}`;
                    alert(msg);
                    return;
                }

                loadedFiles = [];
                fileListContainer.innerHTML = `<div class="italic text-center">Đang tải dữ liệu từ Google Drive...</div>`;
                for (const f of validExcel) {
                    try {
                        const blob = await driveDownloadFileBlob(f.id, f.mimeType);
                        const file = new File([blob], f.name, { type: blob.type });
                        await processAndStoreFile(file, null, f.id);
                    } catch (fileErr) {
                        console.error(`Lỗi tải/phân tích file "${f.name}" từ Drive:`, fileErr);
                    }
                }
                if (loadedFiles.length === 0) {
                    throw new Error(`Có ${validExcel.length} file trong thư mục "data" nhưng không file nào đọc được (kiểm tra lại định dạng file, hoặc mở Console trình duyệt (F12) để xem chi tiết lỗi từng file).`);
                }
                const titleEl = document.getElementById('fileListSectionTitle');
                if (titleEl) titleEl.textContent = '📄 Tệp dữ liệu đang mở (Google Drive)';
                renderFileList();
                switchFile(0);

                // 2. Thư mục con "logdata" — nhật ký bảo trì
                driveLogFolderId = await driveFindOrCreateFolder(driveFolderId, 'logdata');

                // 3. Thư mục con "technician" — nhân sự
                driveTechnicianFolderId = await driveFindOrCreateFolder(driveFolderId, 'technician');
                await loadPersonnelCsvFromDrive();

                // 4. Các thư mục con còn lại — mỗi module dữ liệu 1 thư mục riêng
                driveMaintPlanFolderId = await driveFindOrCreateFolder(driveFolderId, 'maintplan');
                driveAdhocPlanFolderId = await driveFindOrCreateFolder(driveFolderId, 'adhocplan');
                driveAdhocCampaignFolderId = await driveFindOrCreateFolder(driveFolderId, 'adhoccampaign');
                driveCompanyInfoFolderId = await driveFindOrCreateFolder(driveFolderId, 'companyinfo');
                driveRcaFolderId = await driveFindOrCreateFolder(driveFolderId, 'rca');
                driveWorkOrdersFolderId = await driveFindOrCreateFolder(driveFolderId, 'workorders');
                driveFmeaFolderId = await driveFindOrCreateFolder(driveFolderId, 'fmea');

                // Ưu tiên nạp dữ liệu đã có trên Drive (nếu có) để đồng bộ giữa các máy
                const [dMaintPlan, dAdhocPlan, dAdhocCampaign, dAdhocCampaignHistory, dCompanyInfo, dRca, dWorkOrders, dFmea] = await Promise.all([
                    driveLoadJsonFile(driveMaintPlanFolderId, 'maintPlan.json'),
                    driveLoadJsonFile(driveAdhocPlanFolderId, 'adhocPlan.json'),
                    driveLoadJsonFile(driveAdhocCampaignFolderId, 'adhocCampaign.json'),
                    driveLoadJsonFile(driveAdhocCampaignFolderId, 'adhocCampaignHistory.json'),
                    driveLoadJsonFile(driveCompanyInfoFolderId, 'companyInfo.json'),
                    driveLoadJsonFile(driveRcaFolderId, 'rcaRecords.json'),
                    driveLoadJsonFile(driveWorkOrdersFolderId, 'workOrders.json'),
                    driveLoadJsonFile(driveFmeaFolderId, 'fmeaRecords.json')
                ]);
                if (dMaintPlan) { maintPlan = dMaintPlan; localStorage.setItem('maintPlan', JSON.stringify(maintPlan)); renderMaintPlan(); }
                if (dAdhocPlan) { adhocPlan = dAdhocPlan; localStorage.setItem('adhocPlan', JSON.stringify(adhocPlan)); renderAdhocPlan(); }
                if (dAdhocCampaign) {
                    adhocCampaign = dAdhocCampaign;
                    localStorage.setItem('adhocCampaign', JSON.stringify(adhocCampaign));
                    const sEl = document.getElementById('adhocStartDate');
                    const eEl = document.getElementById('adhocEndDate');
                    if (sEl) sEl.value = adhocCampaign.startDate || '';
                    if (eEl) eEl.value = adhocCampaign.endDate || '';
                }
                if (dAdhocCampaignHistory) { adhocCampaignHistory = dAdhocCampaignHistory; localStorage.setItem('adhocCampaignHistory', JSON.stringify(adhocCampaignHistory)); }
                if (dCompanyInfo) { saveCompanyInfo(dCompanyInfo); updateMainHeaderTitle(); }
                if (dRca) { rcaRecords = dRca; localStorage.setItem('rcaRecords', JSON.stringify(rcaRecords)); renderRcaList(); }
                if (dWorkOrders) { workOrders = dWorkOrders; localStorage.setItem('workOrders', JSON.stringify(workOrders)); renderWorkOrderPage(); }
                if (dFmea) { fmeaRecords = dFmea; localStorage.setItem('fmeaRecords', JSON.stringify(fmeaRecords)); renderFmeaList(); }

                appMode = 'drive';
                driveActiveFolderId = driveFolderId;
                updatePersonnelDirStatusUI(true, `technician (Google Drive — "${rootInfo.name}")`);
                updateLogDirStatusUI(true, `logdata (Google Drive — "${rootInfo.name}")`);
                updateHeaderUserStatus();

                if (badgeEl) badgeEl.textContent = '🟢 Đã kích hoạt';
                if (statusEl) {
                    statusEl.innerHTML = `🟢 Đang làm việc ONLINE với thư mục Google Drive: <strong>${rootInfo.name}</strong><br>📊 Dữ liệu: ${validExcel.length} file từ "data" &nbsp;•&nbsp; 📜 Nhật ký: "logdata" &nbsp;•&nbsp; 👥 Nhân sự: "technician" &nbsp;•&nbsp; 🗂️ Kế hoạch / RCA / FMEA / Work Order: đã đồng bộ`;
                }

                if (pendingGotoTab === 'workorder') {
                    pendingGotoTab = null;
                    hasLoadedDataOnce = true;
                    closeSidebar();
                    switchMainTab('workorder');
                } else if (!hasLoadedDataOnce) {
                    hasLoadedDataOnce = true;
                    closeSidebar();
                    switchMainTab('dashboard');
                }

                // Kích hoạt xong: ẩn màn hình gate, mở khoá toàn bộ giao diện chính
                const gateStatusOk = document.getElementById('authGateActivateStatus');
                if (gateStatusOk) gateStatusOk.innerHTML = `🟢 Đã kích hoạt "${rootInfo.name}" thành công!`;
                document.body.classList.add('authenticated');
                document.getElementById('authGateScreen')?.remove();
            } catch (err) {
                if (badgeEl) badgeEl.textContent = '🔴 Kích hoạt lỗi';
                if (statusEl) statusEl.innerHTML = `🔴 Lỗi: ${err.message}`;
                const gateStatus = document.getElementById('authGateActivateStatus');
                if (gateStatus) gateStatus.textContent = `🔴 Lỗi: ${err.message}`;
                alert('Không thể kích hoạt thư mục dự án Drive: ' + err.message);
            }
        }

        // Đọc file nhan_su.csv từ thư mục "technician" trên Drive (nếu có), hoặc tạo mới từ dữ liệu hiện tại
        async function loadPersonnelCsvFromDrive() {
            if (!driveTechnicianFolderId) return;
            try {
                const existing = await driveFindFileByName(driveTechnicianFolderId, 'nhan_su.csv');
                if (!existing) {
                    await driveUploadFile(driveTechnicianFolderId, 'nhan_su.csv', buildPersonnelCsvString(), 'text/csv', null);
                    return;
                }
                const blob = await driveDownloadFileBlob(existing.id);
                const text = (await blob.text()).replace(/^\uFEFF/, '');
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
                console.error("Lỗi nạp file nhân sự từ Drive:", err);
            }
        }

        // ================================================================
