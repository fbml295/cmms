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

        // ---------------------------------------------------------------
        // Module Nhân sự đã tách ra file riêng: xem personnel.js
        // (load ngay sau app.js trong index.html)
        // ---------------------------------------------------------------

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

        // Dùng khi hoàn thành 1 lệnh công việc (bảo trì ngày/định kỳ) mà phát hiện hư hỏng —
        // tự động thêm 1 mục mới vào Kế hoạch bảo trì đột xuất để theo dõi tiếp, không cần thao tác thủ công.
        function pushWoFindingToAdhocPlan(deviceCode, deviceName, jobText, sourceNote) {
            let rowIdx = -1, area = '';
            if (currentFileIdx !== -1 && deviceCode) {
                const file = loadedFiles[currentFileIdx];
                const struct = analyzeStructure(file.rows);
                for (let i = 0; i < file.rows.length; i++) {
                    if (struct.item !== -1 && String(file.rows[i][struct.item]).trim() === String(deviceCode).trim()) {
                        rowIdx = i;
                        area = struct.area !== -1 && file.rows[i][struct.area] ? String(file.rows[i][struct.area]).trim() : '';
                        break;
                    }
                }
            }
            if (rowIdx !== -1) {
                return addToAdhocPlan(rowIdx, jobText || '', sourceNote || '');
            }
            // Không tìm thấy dòng dữ liệu tương ứng (thiết bị thuộc file khác chưa mở) — vẫn thêm thủ công
            const newPlanId = Date.now() + Math.random().toString(36).substr(2, 5);
            adhocPlan.push({
                planId: newPlanId, rowIdx: -1, item: deviceCode || '', name: deviceName || '', area: area,
                jobText: jobText || '', deviceInfo: '', sourceNote: sourceNote || '',
                timeline: [], addedAt: getCurrentTimestamp(), assignedTo: '', priority: 2, waitingMaterials: false
            });
            saveAdhocPlanToLocalStorage();
            renderAdhocPlan();
            return newPlanId;
        }

        // Thêm 1 hạng mục Bảo trì đột xuất KHÔNG gắn với dòng dữ liệu Excel nào —
        // dùng cho việc phát sinh ngoài danh mục thiết bị (sửa cơ sở vật chất, vệ sinh khu vực chung, thiết bị mượn tạm...).
        function openManualAdhocModal() {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'manualAdhocModal';
            modal.innerHTML = `
                <div class="modal-content" style="width: 420px; max-width: 92vw;">
                    <div class="modal-header">
                        <span class="modal-title">➕ Thêm việc không có trong danh mục</span>
                        <button class="close-modal" onclick="document.getElementById('manualAdhocModal').remove()">✖</button>
                    </div>
                    <div class="form-group">
                        <label>Mã định danh (tuỳ chọn)</label>
                        <input type="text" id="manualAdhoc_item" class="search-input" placeholder="VD: KV-KHO (để trống nếu không cần)">
                    </div>
                    <div class="form-group">
                        <label>Tên / Mô tả khu vực hoặc hạng mục *</label>
                        <input type="text" id="manualAdhoc_name" class="search-input" placeholder="VD: Sửa cửa kho vật tư">
                    </div>
                    <div class="form-group">
                        <label>Nội dung công việc cần làm</label>
                        <textarea id="manualAdhoc_job" class="log-textarea" placeholder="Mô tả cụ thể công việc cần thực hiện..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>Mức ưu tiên</label>
                        <select id="manualAdhoc_priority" class="search-input">
                            <option value="0">Chưa đánh giá</option>
                            <option value="1">★ Ưu tiên 3</option>
                            <option value="2" selected>★★ Ưu tiên 2</option>
                            <option value="3">★★★ Ưu tiên 1 (khẩn)</option>
                        </select>
                    </div>
                    <button class="btn btn-emerald" style="width:100%; padding:9px; margin-top:6px;" onclick="saveManualAdhocTask()">💾 Thêm vào Bảo trì đột xuất</button>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function saveManualAdhocTask() {
            const item = document.getElementById('manualAdhoc_item')?.value.trim() || '';
            const name = document.getElementById('manualAdhoc_name')?.value.trim() || '';
            const jobText = document.getElementById('manualAdhoc_job')?.value.trim() || '';
            const priority = parseInt(document.getElementById('manualAdhoc_priority')?.value) || 0;

            if (!name) { alert('Vui lòng nhập Tên / Mô tả khu vực hoặc hạng mục.'); return; }

            const newPlanId = Date.now() + Math.random().toString(36).substr(2, 5);
            adhocPlan.push({
                planId: newPlanId, rowIdx: -1, item: item, name: name, area: '',
                jobText: jobText, deviceInfo: '', sourceNote: 'Thêm thủ công — không có trong danh mục dữ liệu',
                timeline: [], addedAt: getCurrentTimestamp(), assignedTo: '', priority: priority, waitingMaterials: false
            });
            saveAdhocPlanToLocalStorage();
            renderAdhocPlan();
            document.getElementById('manualAdhocModal')?.remove();
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
            showDeleteConfirm('Xóa mục này khỏi Kế hoạch bảo trì đột xuất?', () => {
                adhocPlan = adhocPlan.filter(p => p.planId !== planId);
                if (selectedAdhocTaskId === planId) selectedAdhocTaskId = null;
                saveAdhocPlanToLocalStorage();
                renderAdhocPlan();
            });
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
            showDeleteConfirm('Xóa mục này khỏi Kế hoạch bảo trì định kỳ?', () => {
                maintPlan = maintPlan.filter(p => p.planId !== planId);
                savePlanToLocalStorage();
                renderMaintPlan();
            });
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

        let maintPlanCalendarFilterDate = null; // Ngày đang lọc khi bấm chọn 1 ô trên lịch tháng (null = xem tất cả)
        let maintPlanCalendarMonth = new Date().getMonth(); // 0-11
        let maintPlanCalendarYear = new Date().getFullYear();

        function maintPlanCalendarNav(delta) {
            maintPlanCalendarMonth += delta;
            if (maintPlanCalendarMonth > 11) { maintPlanCalendarMonth = 0; maintPlanCalendarYear++; }
            if (maintPlanCalendarMonth < 0) { maintPlanCalendarMonth = 11; maintPlanCalendarYear--; }
            renderMaintPlanCalendar();
        }

        function maintPlanCalendarSelectDay(dateStr) {
            maintPlanCalendarFilterDate = (maintPlanCalendarFilterDate === dateStr) ? null : dateStr;
            renderMaintPlan();
        }

        // Lịch xem theo tháng cho Kế hoạch bảo trì định kỳ — mỗi ô ngày hiện số công việc đã lên lịch,
        // bấm vào 1 ngày để lọc nhanh danh sách bên dưới chỉ hiện đúng công việc ngày đó.
        function renderMaintPlanCalendar() {
            const wrap = document.getElementById('maintPlanCalendarSection');
            if (!wrap) return;

            const monthNames = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
            const firstDay = new Date(maintPlanCalendarYear, maintPlanCalendarMonth, 1);
            const daysInMonth = new Date(maintPlanCalendarYear, maintPlanCalendarMonth + 1, 0).getDate();
            let startWeekday = firstDay.getDay() - 1; // Thứ 2 = cột đầu tiên
            if (startWeekday < 0) startWeekday = 6;

            const countByDate = {};
            maintPlan.forEach(p => {
                if (p.scheduledDate) countByDate[p.scheduledDate] = (countByDate[p.scheduledDate] || 0) + 1;
            });

            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            let cellsHtml = '';
            for (let i = 0; i < startWeekday; i++) cellsHtml += `<div class="maintcal-cell maintcal-empty"></div>`;
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${maintPlanCalendarYear}-${String(maintPlanCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const count = countByDate[dateStr] || 0;
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === maintPlanCalendarFilterDate;
                cellsHtml += `
                    <div class="maintcal-cell ${isToday ? 'maintcal-today' : ''} ${isSelected ? 'maintcal-selected' : ''} ${count > 0 ? 'maintcal-hasjob' : ''}"
                         onclick="maintPlanCalendarSelectDay('${dateStr}')" title="${count} công việc đã lên lịch">
                        <span class="maintcal-daynum">${day}</span>
                        ${count > 0 ? `<span class="maintcal-badge">${count}</span>` : ''}
                    </div>
                `;
            }

            wrap.innerHTML = `
                <div class="maintcal-header">
                    <button class="btn btn-slate maintcal-nav-btn" onclick="maintPlanCalendarNav(-1)">&#8592;</button>
                    <span class="maintcal-monthlabel">${monthNames[maintPlanCalendarMonth]} ${maintPlanCalendarYear}</span>
                    <button class="btn btn-slate maintcal-nav-btn" onclick="maintPlanCalendarNav(1)">&#8594;</button>
                    ${maintPlanCalendarFilterDate ? `<button class="btn btn-rose" style="padding:3px 10px; font-size:0.7rem; margin-left:auto;" onclick="maintPlanCalendarFilterDate=null; renderMaintPlan();">✖ Bỏ lọc ngày</button>` : ''}
                </div>
                <div class="maintcal-grid">
                    <div class="maintcal-weekday">T2</div><div class="maintcal-weekday">T3</div><div class="maintcal-weekday">T4</div>
                    <div class="maintcal-weekday">T5</div><div class="maintcal-weekday">T6</div><div class="maintcal-weekday">T7</div>
                    <div class="maintcal-weekday">CN</div>
                    ${cellsHtml}
                </div>
            `;
        }

        function renderMaintPlan() {
            renderMaintPlanCalendar();

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

            const visiblePlan = maintPlanCalendarFilterDate
                ? maintPlan.filter(p => p.scheduledDate === maintPlanCalendarFilterDate)
                : maintPlan;

            if (visiblePlan.length === 0) {
                const [y, m, d] = maintPlanCalendarFilterDate.split('-');
                planContainer.innerHTML = `
                    <div class="italic text-center p-20" style="color: var(--text-muted); margin-top: 50px;">
                        Không có công việc nào lên lịch ngày ${d}/${m}/${y}.<br>
                        <button class="btn btn-slate" style="margin-top:10px; padding:5px 12px; font-size:0.75rem;" onclick="maintPlanCalendarFilterDate=null; renderMaintPlan();">✖ Bỏ lọc, xem tất cả</button>
                    </div>
                `;
                updatePlanActionButtons();
                return;
            }

            updatePlanActionButtons();
            let planHtml = '';

            visiblePlan.forEach(p => {
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
