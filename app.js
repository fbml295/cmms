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

        // Sidebar "Dữ liệu" đã gộp vào tab Cấu hình — 2 hàm này giữ lại dạng an toàn (no-op)
        // để các đoạn code khác gọi openSidebar()/closeSidebar() không bị lỗi.
        function openSidebar() {
            document.getElementById('fileSidebar')?.classList.remove('collapsed');
            document.getElementById('sidebarBackdrop')?.classList.add('show');
        }
        function closeSidebar() {
            document.getElementById('fileSidebar')?.classList.add('collapsed');
            document.getElementById('sidebarBackdrop')?.classList.remove('show');
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
            // Đăng ký sự kiện cho các hàm nằm ở file khác (device.js, plan.js...) —
            // phải làm ở đây (sau khi mọi file JS đã tải xong), không được làm ở đầu app.js
            // vì lúc đó các file kia (tải sau) chưa tồn tại, sẽ gây lỗi dừng cả script.
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
            if (nextDate < today) return 'overdue';
            const diffDays = Math.round((nextDate - today) / (1000 * 60 * 60 * 24));
            return diffDays <= 7 ? 'highlight' : ''; // "highlight" = sắp đến hạn trong vòng 7 ngày
        }

        // --- FORM CHỈNH SỬA THÔNG TIN THIẾT BỊ ---

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

        // ---------------------------------------------------------------
        // HỘP THOẠI XÁC NHẬN XOÁ DÙNG CHUNG (thay cho confirm() mặc định của trình duyệt)
        // Nút "Xóa" luôn nằm bên trái, "Hủy" bên phải — dùng cho MỌI tính năng có xoá dữ liệu.
        // Cách dùng: showDeleteConfirm('Xóa nhân sự này?', () => { ...code xoá thật sự... });
        // ---------------------------------------------------------------
        let _pendingDeleteConfirmCallback = null;

        function showDeleteConfirm(message, onConfirm) {
            document.getElementById('deleteConfirmModal')?.remove();
            _pendingDeleteConfirmCallback = onConfirm;
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'deleteConfirmModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 360px; text-align: center;">
                    <div style="font-size: 2rem; margin-bottom: 6px;">🗑️</div>
                    <div style="font-size: 0.88rem; color: var(--text-main); margin: 0 0 20px; line-height:1.5;">${message}</div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-rose" style="flex:1; padding:10px;" onclick="_confirmDeleteYes()">🗑️ Xóa</button>
                        <button class="btn btn-slate" style="flex:1; padding:10px;" onclick="_confirmDeleteNo()">Hủy</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        function _confirmDeleteYes() {
            const cb = _pendingDeleteConfirmCallback;
            document.getElementById('deleteConfirmModal')?.remove();
            _pendingDeleteConfirmCallback = null;
            if (cb) cb();
        }
        function _confirmDeleteNo() {
            document.getElementById('deleteConfirmModal')?.remove();
            _pendingDeleteConfirmCallback = null;
        }

        // ---------------------------------------------------------------
        // ĐO HIỆU SUẤT & ĐỘ TIN CẬY: MTBF (thời gian trung bình giữa các lần hỏng)
        // và MTTR (thời gian trung bình để sửa xong), tính từ nhật ký bảo trì đã ghi nhận.
        // ---------------------------------------------------------------

        // Nhật ký được ghi từ nhiều luồng khác nhau (định kỳ/đột xuất/Việc ngày) nên định dạng ngày giờ
        // hơi khác nhau — hàm này thử nhiều cách đọc để đảm bảo tính đúng khoảng cách thời gian.
        function parseLogDateTime(str) {
            if (!str) return null;
            let m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
            if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
            m = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})(:(\d{2}))?/);
            if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[7] || 0));
            const d = new Date(str);
            return isNaN(d.getTime()) ? null : d;
        }

        // Tính MTBF (ngày)/MTTR (giờ) cho 1 thiết bị cụ thể, dựa trên các lần ghi nhận kết quả "Không đạt"
        function calculateDeviceReliability(itemCode) {
            const logs = (deviceLogs[itemCode] || []);
            const failures = logs
                .filter(e => e.result === 'fail')
                .map(e => ({ ...e, _date: parseLogDateTime(e.performedAt) }))
                .filter(e => e._date)
                .sort((a, b) => a._date - b._date);

            let mtbfDays = null;
            if (failures.length >= 2) {
                const totalMs = failures[failures.length - 1]._date - failures[0]._date;
                mtbfDays = (totalMs / (1000 * 60 * 60 * 24)) / (failures.length - 1);
            }

            let mttrHours = null;
            const withDowntime = failures.filter(e => e.downtimeMinutes && !isNaN(parseFloat(e.downtimeMinutes)));
            if (withDowntime.length > 0) {
                const totalMinutes = withDowntime.reduce((sum, e) => sum + parseFloat(e.downtimeMinutes), 0);
                mttrHours = (totalMinutes / withDowntime.length) / 60;
            }

            return { failureCount: failures.length, mtbfDays, mttrHours };
        }

        // Tổng hợp MTBF/MTTR toàn nhà máy (trung bình theo từng thiết bị có đủ dữ liệu) + xếp hạng độ tin cậy
        function calculateFactoryReliability() {
            const perDevice = [];
            Object.keys(deviceLogs).forEach(itemCode => {
                const stats = calculateDeviceReliability(itemCode);
                if (stats.failureCount > 0) {
                    const deviceInfo = allValidRows.find(d => d.item === itemCode);
                    perDevice.push({ item: itemCode, name: deviceInfo ? deviceInfo.name : '', ...stats });
                }
            });

            const withMtbf = perDevice.filter(d => d.mtbfDays !== null);
            const withMttr = perDevice.filter(d => d.mttrHours !== null);

            const avgMtbf = withMtbf.length > 0 ? withMtbf.reduce((s, d) => s + d.mtbfDays, 0) / withMtbf.length : null;
            const avgMttr = withMttr.length > 0 ? withMttr.reduce((s, d) => s + d.mttrHours, 0) / withMttr.length : null;

            const worstReliability = withMtbf.slice().sort((a, b) => a.mtbfDays - b.mtbfDays).slice(0, 10);

            return { avgMtbf, avgMttr, deviceCount: withMtbf.length, worstReliability };
        }

        function rcaEsc(v) {
            return String(v === undefined || v === null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        }

        // ---------------------------------------------------------------
        // Các module RCA, FMEA, Work Order đã được tách ra file riêng:
        // xem rca.js, fmea.js, workorder.js (load ngay sau app.js trong index.html)
        // ---------------------------------------------------------------

        // ---------------------------------------------------------------
        // Cấu hình Drive/Gemini, Chatbot, Đăng nhập đã tách ra file riêng:
        // xem drive.js, chatbot.js (load ngay sau app.js trong index.html)
        // ---------------------------------------------------------------

        // ---------------------------------------------------------------
        // Module Thiết bị, Kế hoạch, Dashboard đã tách ra file riêng:
        // xem device.js, plan.js, dashboard.js (load ngay sau app.js trong index.html)
        // ---------------------------------------------------------------
