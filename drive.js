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
        // Đăng xuất khỏi Google (thu hồi token thật sự) rồi tải lại trang để quay về màn hình đăng nhập —
        // dùng khi cần đổi sang tài khoản Google khác.
        function logoutAndSwitchAccount() {
            if (!confirm('Đăng xuất khỏi tài khoản Google hiện tại và quay về màn hình đăng nhập?')) return;
            try {
                if (driveAccessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2 && google.accounts.oauth2.revoke) {
                    google.accounts.oauth2.revoke(driveAccessToken, () => location.reload());
                } else {
                    location.reload();
                }
            } catch (e) {
                location.reload();
            }
        }

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
            driveMasterPlanFolderId = '';    

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

                // Xoá sạch dữ liệu của dự án trước đó khỏi bộ nhớ TRƯỚC khi nạp dự án mới —
                // tránh dữ liệu dự án cũ còn sót lại/hiển thị nhầm khi dự án mới chưa có file tương ứng trên Drive.
                loadedFiles = [];
                allValidRows = [];
                currentFileIdx = -1;
                maintPlan = []; localStorage.setItem('maintPlan', JSON.stringify(maintPlan));
                adhocPlan = []; localStorage.setItem('adhocPlan', JSON.stringify(adhocPlan));
                adhocCampaign = { startDate: '', endDate: '' }; localStorage.setItem('adhocCampaign', JSON.stringify(adhocCampaign));
                adhocCampaignHistory = []; localStorage.setItem('adhocCampaignHistory', JSON.stringify(adhocCampaignHistory));
                rcaRecords = {}; localStorage.setItem('rcaRecords', JSON.stringify(rcaRecords));
                workOrders = {}; localStorage.setItem('workOrders', JSON.stringify(workOrders));
                fmeaRecords = {}; localStorage.setItem('fmeaRecords', JSON.stringify(fmeaRecords));
                masterCampaigns = []; localStorage.setItem('masterCampaigns', JSON.stringify(masterCampaigns));
                personnelList = []; localStorage.setItem('personnelList', JSON.stringify(personnelList));
                saveCompanyInfo({ company: '', department: '', lineName: '' });
                renderMaintPlan(); renderAdhocPlan(); renderRcaList(); renderFmeaList();
                renderWorkOrderPage(); renderPersonnelPage(); updateMainHeaderTitle();
                if (typeof renderMasterPlanPage === 'function') renderMasterPlanPage();   

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
                driveMasterPlanFolderId = await driveFindOrCreateFolder(driveFolderId, 'masterplan');    

                // Ưu tiên nạp dữ liệu đã có trên Drive (nếu có) để đồng bộ giữa các máy
                const [dMaintPlan, dAdhocPlan, dAdhocCampaign, dAdhocCampaignHistory, dCompanyInfo, dRca, dWorkOrders, dFmea, dMasterCampaigns] = await Promise.all([
                    driveLoadJsonFile(driveMaintPlanFolderId, 'maintPlan.json'),
                    driveLoadJsonFile(driveAdhocPlanFolderId, 'adhocPlan.json'),
                    driveLoadJsonFile(driveAdhocCampaignFolderId, 'adhocCampaign.json'),
                    driveLoadJsonFile(driveAdhocCampaignFolderId, 'adhocCampaignHistory.json'),
                    driveLoadJsonFile(driveCompanyInfoFolderId, 'companyInfo.json'),
                    driveLoadJsonFile(driveRcaFolderId, 'rcaRecords.json'),
                    driveLoadJsonFile(driveWorkOrdersFolderId, 'workOrders.json'),
                    driveLoadJsonFile(driveFmeaFolderId, 'fmeaRecords.json')
                    driveLoadJsonFile(driveMasterPlanFolderId, 'masterCampaigns.json'),   
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
                if (dMasterCampaigns) { masterCampaigns = dMasterCampaigns; localStorage.setItem('masterCampaigns', JSON.stringify(masterCampaigns)); }    

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
