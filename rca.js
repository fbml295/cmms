        function saveRcaRecordsToStorage() {
            localStorage.setItem('rcaRecords', JSON.stringify(rcaRecords));
            if (appMode === 'drive' && driveRcaFolderId) driveSyncJsonFile(driveRcaFolderId, 'rcaRecords.json', rcaRecords);
        }

        function loadRcaRecordsFromStorage() {
            const stored = localStorage.getItem('rcaRecords');
            if (stored) {
                try { rcaRecords = JSON.parse(stored); } catch (e) { console.error("Lỗi khôi phục dữ liệu RCA:", e); rcaRecords = {}; }
            }
        }

        function getAllRcaRecordsFlat() {
            return Object.values(rcaRecords).flat();
        }

        function findRcaRecordById(id) {
            return getAllRcaRecordsFlat().find(r => r.id === id) || null;
        }

        // Tạo 1 phiếu RCA mới (nháp) — deviceCtx: { rowIdx, item, name, area }
        function createRcaRecord(deviceCtx, problemDescription, sourceType, sourceLabel) {
            let mainGroup = '', subGroup = '', cabinet = '', model = '';
            if (currentFileIdx !== -1 && deviceCtx && deviceCtx.rowIdx !== undefined && deviceCtx.rowIdx !== null) {
                try {
                    const file = loadedFiles[currentFileIdx];
                    const struct = analyzeStructure(file.rows);
                    const rawRow = file.rows[deviceCtx.rowIdx];
                    if (rawRow) {
                        mainGroup = struct.mainGroup !== -1 && rawRow[struct.mainGroup] ? String(rawRow[struct.mainGroup]).trim() : '';
                        subGroup = struct.subGroup !== -1 && rawRow[struct.subGroup] ? String(rawRow[struct.subGroup]).trim() : '';
                        cabinet = struct.cabinet !== -1 && rawRow[struct.cabinet] ? String(rawRow[struct.cabinet]).trim() : '';
                        model = struct.model !== -1 ? rawRow[struct.model] : '';
                    }
                } catch (e) { /* bỏ qua nếu không lấy được thông tin mở rộng */ }
            }

            const item = (deviceCtx && deviceCtx.item) || '';
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

            const record = {
                id: 'rca_' + Date.now() + Math.random().toString(36).substr(2, 5),
                item: item,
                name: (deviceCtx && deviceCtx.name) || '',
                area: (deviceCtx && deviceCtx.area) || '',
                mainGroup: mainGroup, subGroup: subGroup, cabinet: cabinet, model: model,
                sourceType: sourceType || 'manual', // 'cyclic' | 'adhoc' | 'manual'
                sourceLabel: sourceLabel || 'Tạo thủ công',
                problemDate: todayStr,
                reportedBy: '',
                problemDescription: problemDescription || '',
                impact: '',
                fiveWhys: ['', '', '', '', ''],
                ishikawa: { human: '', machine: '', method: '', material: '', measurement: '', environment: '' },
                rootCause: '',
                rootCauseCategory: '',
                correctiveActions: [{ action: '', type: 'corrective', owner: '', dueDate: '', status: 'pending' }],
                verification: '',
                linkedFmeaId: '',
                status: 'draft',
                createdAt: getCurrentTimestamp(),
                updatedAt: getCurrentTimestamp(),
                completedAt: ''
            };

            const key = item || '_khong_gan_thiet_bi_';
            if (!rcaRecords[key]) rcaRecords[key] = [];
            rcaRecords[key].push(record);
            saveRcaRecordsToStorage();
            return record;
        }

        function deleteRcaRecord(id) {
            showDeleteConfirm('Xóa phiếu RCA này? Hành động không thể hoàn tác.', () => {
                Object.keys(rcaRecords).forEach(key => {
                    rcaRecords[key] = rcaRecords[key].filter(r => r.id !== id);
                });
                saveRcaRecordsToStorage();
                closeRcaEditor();
                renderRcaList();
            });
        }

        // --- DANH SÁCH PHIẾU RCA ---
        function renderRcaList() {
            const container = document.getElementById('rcaListContainer');
            const summaryGrid = document.getElementById('rcaSummaryGrid');
            if (!container) return;

            const all = getAllRcaRecordsFlat().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
            const draftCount = all.filter(r => r.status === 'draft').length;
            const completedCount = all.filter(r => r.status === 'completed').length;

            if (summaryGrid) {
                summaryGrid.innerHTML = `
                    <div class="stat-card c-rose"><span class="stat-icon">🔍</span><div><div class="stat-label">Tổng số phiếu</div><div class="stat-value">${all.length}</div></div></div>
                    <div class="stat-card c-amber"><span class="stat-icon">📝</span><div><div class="stat-label">Đang phân tích</div><div class="stat-value">${draftCount}</div></div></div>
                    <div class="stat-card c-emerald"><span class="stat-icon">✅</span><div><div class="stat-label">Đã hoàn tất</div><div class="stat-value">${completedCount}</div></div></div>
                `;
            }

            renderRcaPersonStats(all);

            const filterSelect = document.getElementById('rcaStatusFilterSelect');
            const statusFilter = filterSelect ? filterSelect.value : 'all';
            let visible = all;
            if (statusFilter !== 'all') visible = visible.filter(r => r.status === statusFilter);

            if (visible.length === 0) {
                container.innerHTML = `<div class="italic text-center p-20" style="color: var(--text-muted); margin-top: 30px;">Không có phiếu RCA nào khớp với bộ lọc. Tích chọn ô "🔍 RCA" khi ghi nhận hoàn thành bảo trì, hoặc bấm "➕ Tạo phiếu RCA mới" để bắt đầu.</div>`;
                return;
            }

            container.innerHTML = visible.map(r => {
                const sourceIcon = r.sourceType === 'cyclic' ? '♻️' : (r.sourceType === 'adhoc' ? '🔧' : '✍️');
                const validActions = (r.correctiveActions || []).filter(a => a.action && a.action.trim());
                const actionsHtml = validActions.length > 0 ? validActions.map(a => {
                    const statusLabel = a.status === 'done' ? '✅ Hoàn thành' : (a.status === 'in_progress' ? '▶️ Đang thực hiện' : '🕓 Chưa thực hiện');
                    return `
                        <div class="rca-mini-action">
                            <div class="rca-mini-action-text" title="${rcaEsc(a.action)}">${rcaEsc(a.action)}</div>
                            <div class="rca-mini-action-meta">
                                <span>👤 ${rcaEsc(a.owner) || '—'}</span>
                                <span>📅 ${a.dueDate ? a.dueDate.split('-').reverse().join('/') : '—'}</span>
                            </div>
                            <div style="margin-top:4px;"><span class="rca-mini-status-badge ${a.status || 'pending'}">${statusLabel}</span></div>
                        </div>
                    `;
                }).join('') : `<div class="italic" style="color: var(--text-muted); font-size: 0.72rem;">Chưa có hành động nào</div>`;

                return `
                    <div class="rca-list-card ${r.status === 'completed' ? 'is-completed' : ''}" onclick="openRcaEditor('${r.id}')">
                        <div class="rca-list-card-grid">
                            <div>
                                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                        <span class="rca-status-pill ${r.status}">${rcaStatusLabel(r)}</span>
                                        <span class="rca-source-pill">${sourceIcon} ${rcaEsc(r.sourceLabel || '')}</span>
                                    </div>
                                    <span style="font-size:0.72rem; color: var(--text-muted);">${r.problemDate || ''}</span>
                                </div>
                                <div style="margin-top:6px;">
                                    <strong style="color:white; font-size:0.85rem;">${rcaEsc(r.item || '(chưa gắn thiết bị)')}</strong>
                                    <span style="color: var(--text-muted); font-size:0.8rem;"> — ${rcaEsc(r.name || '')}${r.area ? ` <span style="font-size:0.72rem;">📍 ${rcaEsc(r.area)}</span>` : ''}</span>
                                </div>
                                <div style="font-size:0.78rem; color: var(--text-muted); margin-top:4px; white-space:pre-wrap;">${rcaEsc((r.problemDescription || 'Chưa nhập mô tả vấn đề...').slice(0, 180))}</div>
                            </div>
                            <div class="rca-list-card-right">
                                <div class="rca-list-card-actions-title">🔧 Hành động</div>
                                ${actionsHtml}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // --- THỐNG KÊ RCA THEO NGƯỜI PHÂN TÍCH / NGƯỜI PHỤ TRÁCH (DASHBOARD RCA) ---
        function renderRcaPersonStats(all) {
            const grid = document.getElementById('rcaPersonStatsGrid');
            if (!grid) return;
            if (!all || all.length === 0) {
                grid.innerHTML = '';
                return;
            }

            const searchIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px; margin-right:2px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
            const wrenchIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px; margin-right:2px;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>';

            function buildAnalystTable() {
                const counts = {};
                all.forEach(r => {
                    const name = (r.reportedBy || '').trim();
                    if (!name) return;
                    if (!counts[name]) counts[name] = { total: 0, completed: 0 };
                    counts[name].total++;
                    if (r.status === 'completed') counts[name].completed++;
                });
                const names = Object.keys(counts).sort((a, b) => counts[b].total - counts[a].total);
                if (names.length === 0) {
                    return `
                        <div class="dashboard-split-panel">
                            <div class="dashboard-split-subtitle">${searchIcon} Thống kê theo người phân tích</div>
                            <div class="italic" style="color: var(--text-muted); font-size: 0.8rem; padding: 8px 0;">Chưa có dữ liệu.</div>
                        </div>
                    `;
                }
                const rows = names.map(name => `
                    <tr>
                        <td style="padding:5px 6px; color:white;">${rcaEsc(name)}</td>
                        <td style="padding:5px 6px; text-align:center;">${counts[name].total}</td>
                        <td style="padding:5px 6px; text-align:center; color:var(--color-emerald);">${counts[name].completed}</td>
                    </tr>
                `).join('');
                return `
                    <div class="dashboard-split-panel">
                        <div class="dashboard-split-subtitle">${searchIcon} Thống kê theo người phân tích</div>
                        <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
                            <thead>
                                <tr style="color:var(--text-muted); text-align:left; border-bottom:1px solid var(--border-color);">
                                    <th style="padding:5px 6px;">Nhân sự</th>
                                    <th style="padding:5px 6px; text-align:center;">Số phiếu</th>
                                    <th style="padding:5px 6px; text-align:center;">Đã hoàn tất</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                `;
            }

            function buildOwnerTable() {
                const counts = {};
                all.forEach(r => {
                    (r.correctiveActions || []).forEach(a => {
                        const name = (a.owner || '').trim();
                        if (!name || !a.action || !a.action.trim()) return;
                        if (!counts[name]) counts[name] = { total: 0, done: 0 };
                        counts[name].total++;
                        if (a.status === 'done') counts[name].done++;
                    });
                });
                const names = Object.keys(counts).sort((a, b) => counts[b].total - counts[a].total);
                if (names.length === 0) {
                    return `
                        <div class="dashboard-split-panel">
                            <div class="dashboard-split-subtitle">${wrenchIcon} Thống kê theo người phụ trách</div>
                            <div class="italic" style="color: var(--text-muted); font-size: 0.8rem; padding: 8px 0;">Chưa có dữ liệu.</div>
                        </div>
                    `;
                }
                const rows = names.map(name => `
                    <tr>
                        <td style="padding:5px 6px; color:white;">${rcaEsc(name)}</td>
                        <td style="padding:5px 6px; text-align:center;">${counts[name].total}</td>
                        <td style="padding:5px 6px; text-align:center; color:var(--color-emerald);">${counts[name].done}</td>
                    </tr>
                `).join('');
                return `
                    <div class="dashboard-split-panel">
                        <div class="dashboard-split-subtitle">${wrenchIcon} Thống kê theo người phụ trách</div>
                        <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
                            <thead>
                                <tr style="color:var(--text-muted); text-align:left; border-bottom:1px solid var(--border-color);">
                                    <th style="padding:5px 6px;">Nhân sự</th>
                                    <th style="padding:5px 6px; text-align:center;">Hành động được giao</th>
                                    <th style="padding:5px 6px; text-align:center;">Đã hoàn thành</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                `;
            }

            grid.innerHTML = buildAnalystTable() + buildOwnerTable();
        }

        // --- MỞ / ĐÓNG TRÌNH SOẠN THẢO 1 PHIẾU RCA ---
        function openRcaEditor(id) {
            let rec;
            if (id) {
                rec = findRcaRecordById(id);
                if (!rec) { alert("Không tìm thấy phiếu RCA này!"); return; }
            } else {
                rec = createRcaRecord({ rowIdx: null, item: '', name: '', area: '' }, '', 'manual', 'Tạo thủ công');
            }
            rcaEditingRecord = JSON.parse(JSON.stringify(rec));
            const listView = document.getElementById('rcaListView');
            const editorView = document.getElementById('rcaEditorView');
            if (listView) listView.classList.add('hidden');
            if (editorView) editorView.classList.remove('hidden');
            renderRcaEditor();
        }

        function closeRcaEditor() {
            rcaEditingRecord = null;
            const editorView = document.getElementById('rcaEditorView');
            if (editorView) { editorView.classList.add('hidden'); editorView.innerHTML = ''; }
            const listView = document.getElementById('rcaListView');
            if (listView) listView.classList.remove('hidden');
        }

        // --- CẬP NHẬT DỮ LIỆU MÔ HÌNH ĐANG CHỈNH SỬA (LIVE BINDING, KHÔNG RENDER LẠI) ---
        function updateRcaSimpleField(field, value) {
            if (!rcaEditingRecord) return;
            rcaEditingRecord[field] = value;
        }
        function updateRcaWhy(idx, value) {
            if (!rcaEditingRecord) return;
            rcaEditingRecord.fiveWhys[idx] = value;
        }
        function updateRcaIshikawa(key, value) {
            if (!rcaEditingRecord) return;
            rcaEditingRecord.ishikawa[key] = value;
        }
        function updateRcaAction(idx, field, value) {
            if (!rcaEditingRecord) return;
            rcaEditingRecord.correctiveActions[idx][field] = value;
        }
        function addRcaActionRow() {
            if (!rcaEditingRecord) return;
            rcaEditingRecord.correctiveActions.push({ action: '', type: 'corrective', owner: '', dueDate: '', status: 'pending' });
            renderRcaEditor();
        }
        function removeRcaActionRow(idx) {
            if (!rcaEditingRecord) return;
            if (rcaEditingRecord.correctiveActions.length <= 1) {
                rcaEditingRecord.correctiveActions[0] = { action: '', type: 'corrective', owner: '', dueDate: '', status: 'pending' };
            } else {
                rcaEditingRecord.correctiveActions.splice(idx, 1);
            }
            renderRcaEditor();
        }

        const RCA_WHY_LABELS = ['Tại sao vấn đề này xảy ra? (Why 1)', 'Tại sao? (Why 2)', 'Tại sao? (Why 3)', 'Tại sao? (Why 4)', 'Tại sao? — Nguyên nhân gốc rễ có thể ở đây (Why 5)'];
        const RCA_STEP_TITLES = ['Xác định vấn đề', 'Phân tích 5 Why', 'Sơ đồ xương cá (6M)', 'Nguyên nhân gốc rễ', 'Hành động khắc phục/phòng ngừa', 'Xác nhận hiệu quả'];

        // Xác định các bước (1-6) đã có dữ liệu, dựa vào đó suy ra bước đang thực hiện (mục sáng)
        function computeRcaStepsDone(r) {
            return [
                !!(r.problemDescription && r.problemDescription.trim()),
                (r.fiveWhys || []).some(w => w && w.trim()),
                r.ishikawa ? Object.values(r.ishikawa).some(v => v && v.trim()) : false,
                !!(r.rootCause && r.rootCause.trim()),
                (r.correctiveActions || []).some(a => a.action && a.action.trim()),
                !!(r.verification && r.verification.trim())
            ];
        }

        // Bước đang thực hiện = bước sâu nhất đã có dữ liệu (nếu chưa nhập gì thì mặc định là bước 1)
        function computeRcaCurrentStep(r) {
            if (r.status === 'completed') return 6;
            const done = computeRcaStepsDone(r);
            let current = 1;
            for (let i = 0; i < done.length; i++) {
                if (done[i]) current = i + 1;
            }
            return current;
        }

        // Nhãn trạng thái phiếu RCA: chính là trạng thái của mục đang thực hiện
        function rcaStatusLabel(r) {
            if (r.status === 'completed') return '✅ Đã hoàn tất';
            const step = computeRcaCurrentStep(r);
            return `📝 Đang thực hiện: Bước ${step} — ${RCA_STEP_TITLES[step - 1]}`;
        }

        const RCA_ISHIKAWA_META = [
            { key: 'human', icon: '👤', label: 'Con người (Man)', ph: 'Thiếu kỹ năng, sai quy trình thao tác, chủ quan...' },
            { key: 'machine', icon: '⚙️', label: 'Máy móc (Machine)', ph: 'Hao mòn, hỏng linh kiện, thiếu bảo trì...' },
            { key: 'method', icon: '📋', label: 'Phương pháp (Method)', ph: 'Quy trình chưa chuẩn, thiếu hướng dẫn...' },
            { key: 'material', icon: '📦', label: 'Vật liệu (Material)', ph: 'Vật tư kém chất lượng, sai quy cách...' },
            { key: 'measurement', icon: '📏', label: 'Đo lường (Measurement)', ph: 'Thiếu cảm biến, sai số đo, chưa hiệu chuẩn...' },
            { key: 'environment', icon: '🌡', label: 'Môi trường (Environment)', ph: 'Nhiệt độ, độ ẩm, bụi bẩn, rung động...' }
        ];

        function renderRcaEditor() {
            const editorView = document.getElementById('rcaEditorView');
            if (!editorView || !rcaEditingRecord) return;
            const r = rcaEditingRecord;
            const isCompleted = r.status === 'completed';
            const readonlyAttr = isCompleted ? 'readonly disabled' : '';
            const currentStep = computeRcaCurrentStep(r);

            const stepperHtml = RCA_STEP_TITLES.map((title, idx) => {
                const stepNum = idx + 1;
                let cls = 'rca-step-pill';
                if (isCompleted || stepNum < currentStep) cls += ' done';
                else if (stepNum === currentStep) cls += ' active';
                return `<span class="${cls}"><span class="num">${isCompleted || stepNum < currentStep ? '✓' : stepNum}</span> ${title}</span>`;
            }).join('');

            const whyRowsHtml = r.fiveWhys.map((w, idx) => `
                <div class="rca-why-row">
                    <div class="rca-why-num">${idx + 1}</div>
                    <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
                        <label style="font-size:0.72rem; color: var(--text-muted); font-weight:700;">${RCA_WHY_LABELS[idx]}</label>
                        <textarea class="log-textarea" style="min-height:40px;" ${readonlyAttr} oninput="updateRcaWhy(${idx}, this.value)">${rcaEsc(w)}</textarea>
                    </div>
                </div>
            `).join('');

            const ishikawaHtml = RCA_ISHIKAWA_META.map(m => `
                <div class="rca-ishikawa-card">
                    <label>${m.icon} ${m.label}</label>
                    <textarea class="log-textarea" style="min-height:56px;" placeholder="${m.ph}" ${readonlyAttr} oninput="updateRcaIshikawa('${m.key}', this.value)">${rcaEsc(r.ishikawa[m.key])}</textarea>
                </div>
            `).join('');

            const actionRowsHtml = r.correctiveActions.map((a, idx) => `
                <tr>
                    <td style="width:26%;"><input type="text" value="${rcaEsc(a.action)}" placeholder="Nội dung hành động..." ${readonlyAttr} oninput="updateRcaAction(${idx}, 'action', this.value)"></td>
                    <td style="width:14%;">
                        <select ${readonlyAttr} onchange="updateRcaAction(${idx}, 'type', this.value)">
                            <option value="corrective" ${a.type === 'corrective' ? 'selected' : ''}>Khắc phục</option>
                            <option value="preventive" ${a.type === 'preventive' ? 'selected' : ''}>Phòng ngừa</option>
                        </select>
                    </td>
                    <td style="width:20%;">
                        <select ${readonlyAttr} onchange="updateRcaAction(${idx}, 'owner', this.value)">${personnelOptionsHtml(a.owner)}</select>
                    </td>
                    <td style="width:16%;"><input type="date" value="${rcaEsc(a.dueDate)}" ${readonlyAttr} oninput="updateRcaAction(${idx}, 'dueDate', this.value)"></td>
                    <td style="width:16%;">
                        <select ${readonlyAttr} onchange="updateRcaAction(${idx}, 'status', this.value)">
                            <option value="pending" ${a.status === 'pending' ? 'selected' : ''}>🕓 Chưa thực hiện</option>
                            <option value="in_progress" ${a.status === 'in_progress' ? 'selected' : ''}>▶️ Đang thực hiện</option>
                            <option value="done" ${a.status === 'done' ? 'selected' : ''}>✅ Hoàn thành</option>
                        </select>
                    </td>
                    <td style="width:4%; text-align:center;">${isCompleted ? '' : `<button type="button" class="rca-remove-row-btn" title="Xóa dòng" onclick="removeRcaActionRow(${idx})">✖</button>`}</td>
                </tr>
            `).join('');

            editorView.innerHTML = `
                <div class="rca-editor-header">
                    <button class="rca-back-btn" onclick="closeRcaEditor(); renderRcaList();">← Quay lại danh sách</button>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="rca-status-pill ${r.status}">${rcaStatusLabel(r)}</span>
                        <span class="rca-source-pill">${r.sourceType === 'cyclic' ? '♻️' : (r.sourceType === 'adhoc' ? '🔧' : '✍️')} ${rcaEsc(r.sourceLabel || '')}</span>
                        <button type="button" class="btn btn-slate" style="padding:5px 10px; font-size:0.72rem;" onclick="printRcaRecord('${r.id}')"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:3px;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>In phiếu RCA</button>
                        ${isCompleted ? '' : `<button type="button" class="btn btn-slate" style="padding:5px 10px; font-size:0.72rem;" onclick="deleteRcaRecord('${r.id}')"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:3px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>Xóa phiếu</button>`}
                    </div>
                </div>

                <div class="rca-stepper">
                    ${stepperHtml}
                </div>

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">1</span> Xác định vấn đề</div>
                    <div class="rca-field-row">
                        <div class="rca-field">
                            <label>Mã thiết bị</label>
                            <input type="text" class="search-input" value="${rcaEsc(r.item)}" placeholder="VD: MC-01" ${readonlyAttr} oninput="updateRcaSimpleField('item', this.value)">
                        </div>
                        <div class="rca-field">
                            <label>Tên / chức năng thiết bị</label>
                            <input type="text" class="search-input" value="${rcaEsc(r.name)}" ${readonlyAttr} oninput="updateRcaSimpleField('name', this.value)">
                        </div>
                        <div class="rca-field">
                            <label>Khu vực</label>
                            <input type="text" class="search-input" value="${rcaEsc(r.area)}" ${readonlyAttr} oninput="updateRcaSimpleField('area', this.value)">
                        </div>
                    </div>
                    <div class="rca-field-row">
                        <div class="rca-field">
                            <label>Ngày xảy ra sự cố</label>
                            <input type="date" class="search-input" value="${rcaEsc(r.problemDate)}" ${readonlyAttr} oninput="updateRcaSimpleField('problemDate', this.value)">
                        </div>
                        <div class="rca-field">
                            <label>Người phân tích</label>
                            <select class="search-input" ${readonlyAttr} onchange="updateRcaSimpleField('reportedBy', this.value)">${personnelOptionsHtml(r.reportedBy)}</select>
                        </div>
                        <div class="rca-field">
                            <label>Mức độ ảnh hưởng</label>
                            <select class="search-input" ${readonlyAttr} onchange="updateRcaSimpleField('impact', this.value)">
                                <option value="">— Chọn mức độ —</option>
                                <option value="low" ${r.impact === 'low' ? 'selected' : ''}>● Thấp — không ảnh hưởng sản xuất</option>
                                <option value="medium" ${r.impact === 'medium' ? 'selected' : ''}>●● Trung bình — ảnh hưởng cục bộ</option>
                                <option value="high" ${r.impact === 'high' ? 'selected' : ''}>●●● Cao — dừng máy/dây chuyền</option>
                                <option value="critical" ${r.impact === 'critical' ? 'selected' : ''}>●●●● Nghiêm trọng — an toàn/thiệt hại lớn</option>
                            </select>
                        </div>
                    </div>
                    <div class="rca-field-row" style="margin-bottom:0;">
                        <div class="rca-field" style="flex-basis:100%;">
                            <label>Mô tả vấn đề / sự cố</label>
                            <textarea class="log-textarea" ${readonlyAttr} oninput="updateRcaSimpleField('problemDescription', this.value)">${rcaEsc(r.problemDescription)}</textarea>
                        </div>
                    </div>
                    <div class="rca-field-row" style="margin-bottom:0; margin-top:10px;">
                        <div class="rca-field" style="flex-basis:100%;">
                            <label>🧩 Liên kết với dạng sai hỏng FMEA (tùy chọn)</label>
                            <select class="search-input" ${readonlyAttr} onchange="updateRcaSimpleField('linkedFmeaId', this.value)">
                                <option value="">— Không liên kết —</option>
                                ${getAllFmeaRecordsFlat().map(f => `<option value="${f.id}" ${r.linkedFmeaId === f.id ? 'selected' : ''}>${rcaEsc(f.item || '(chưa gắn thiết bị)')} — ${rcaEsc(f.failureMode || '(chưa nhập dạng sai hỏng)')} (RPN ${fmeaRpn(f)})</option>`).join('')}
                            </select>
                            <div style="font-size:0.72rem; color: var(--text-muted); margin-top:4px;">Nếu sự cố này khớp với 1 dạng sai hỏng đã có trong FMEA, chọn để hệ thống tự đếm số lần thực tế xảy ra, hỗ trợ gợi ý điểm Tần suất (Occurrence).</div>
                        </div>
                    </div>
                </div>

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">2</span> Phân tích 5 Why</div>
                    <div class="rca-section-sub">Lần lượt trả lời "Tại sao?" cho câu trả lời phía trên, đào sâu dần tới nguyên nhân gốc rễ.</div>
                    ${whyRowsHtml}
                </div>

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">3</span> Sơ đồ xương cá — 6M</div>
                    <div class="rca-section-sub">Xem xét vấn đề dưới từng nhóm nguyên nhân tiềm ẩn.</div>
                    <div class="rca-ishikawa-grid">${ishikawaHtml}</div>
                </div>

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">4</span> Nguyên nhân gốc rễ</div>
                    <div class="rca-field-row">
                        <div class="rca-field" style="flex-basis:220px;">
                            <label>Thuộc nhóm nguyên nhân</label>
                            <select class="search-input" ${readonlyAttr} onchange="updateRcaSimpleField('rootCauseCategory', this.value)">
                                <option value="">— Chọn nhóm —</option>
                                ${RCA_ISHIKAWA_META.map(m => `<option value="${m.key}" ${r.rootCauseCategory === m.key ? 'selected' : ''}>${m.icon} ${m.label}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="rca-field-row" style="margin-bottom:0;">
                        <div class="rca-field" style="flex-basis:100%;">
                            <label>Kết luận nguyên nhân gốc rễ</label>
                            <textarea class="log-textarea" ${readonlyAttr} oninput="updateRcaSimpleField('rootCause', this.value)">${rcaEsc(r.rootCause)}</textarea>
                        </div>
                    </div>
                </div>

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">5</span> Hành động khắc phục / phòng ngừa</div>
                    <table class="rca-actions-table">
                        <thead><tr><th>Hành động</th><th>Loại</th><th>Người phụ trách</th><th>Hạn hoàn thành</th><th>Trạng thái</th><th></th></tr></thead>
                        <tbody>${actionRowsHtml}</tbody>
                    </table>
                    ${isCompleted ? '' : `<button type="button" class="rca-add-row-btn" onclick="addRcaActionRow()">➕ Thêm hành động</button>`}
                </div>

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">6</span> Xác nhận hiệu quả</div>
                    <div class="rca-field-row" style="margin-bottom:0;">
                        <div class="rca-field" style="flex-basis:100%;">
                            <label>Đánh giá hiệu quả sau khi thực hiện hành động khắc phục/phòng ngừa</label>
                            <textarea class="log-textarea" ${readonlyAttr} oninput="updateRcaSimpleField('verification', this.value)">${rcaEsc(r.verification)}</textarea>
                        </div>
                    </div>
                </div>

                <div class="log-actions" style="justify-content:space-between; align-items:center;">
                    <span style="font-size:0.7rem; color: var(--text-muted);">${r.createdAt ? `Tạo lúc: ${r.createdAt}` : ''}${r.completedAt ? ` • Hoàn tất lúc: ${r.completedAt}` : ''}</span>
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${isCompleted
                            ? `<button type="button" class="btn btn-slate" onclick="closeRcaEditor(); renderRcaList();">Đóng</button>`
                            : `${currentStep < 6 ? `<span style="font-size:0.7rem; color: var(--color-amber);">⚠️ Cần nhập Bước 6 - Xác nhận hiệu quả để đóng phiếu</span>` : ''}
                               <button type="button" class="btn btn-slate" onclick="saveRcaDraft()">💾 Lưu nháp</button>
                               <button type="button" class="btn btn-rose${currentStep < 6 ? ' btn-disabled' : ''}" ${currentStep < 6 ? 'disabled title="Cần nhập Bước 6 - Xác nhận hiệu quả trước"' : ''} onclick="completeRcaRecord()">✅ Hoàn tất & Lưu phiếu RCA</button>`
                        }
                    </div>
                </div>
            `;
        }

        // --- LƯU NHÁP (KHÔNG ĐÓNG PHIẾU) ---
        function saveRcaDraft() {
            if (!rcaEditingRecord) return;
            persistRcaEditingRecord();
            alert("Đã lưu nháp phiếu RCA.");
            renderRcaList();
        }

        // Ghi bản ghi đang chỉnh sửa (rcaEditingRecord) đè lên bản gốc trong rcaRecords, xử lý cả trường hợp đổi Mã thiết bị
        function persistRcaEditingRecord() {
            const r = rcaEditingRecord;
            r.updatedAt = getCurrentTimestamp();
            Object.keys(rcaRecords).forEach(key => {
                rcaRecords[key] = rcaRecords[key].filter(rec => rec.id !== r.id);
            });
            const key = r.item || '_khong_gan_thiet_bi_';
            if (!rcaRecords[key]) rcaRecords[key] = [];
            rcaRecords[key].push(r);
            saveRcaRecordsToStorage();
        }

        // --- HOÀN TẤT PHIẾU RCA: KIỂM TRA HỢP LỆ, KHÓA PHIẾU, GHI FILE VÀO THƯ MỤC LOGDATA CỦA THIẾT BỊ ---
        async function completeRcaRecord() {
            if (!rcaEditingRecord) return;
            const r = rcaEditingRecord;

            if (!r.problemDescription || !r.problemDescription.trim()) {
                alert("Vui lòng nhập Mô tả vấn đề / sự cố (Bước 1) trước khi hoàn tất phiếu RCA.");
                return;
            }
            if (!r.rootCause || !r.rootCause.trim()) {
                alert("Vui lòng nhập Kết luận nguyên nhân gốc rễ (Bước 4) trước khi hoàn tất phiếu RCA.");
                return;
            }
            const hasValidAction = r.correctiveActions.some(a => a.action && a.action.trim());
            if (!hasValidAction) {
                alert("Vui lòng nhập ít nhất 1 Hành động khắc phục/phòng ngừa (Bước 5) trước khi hoàn tất phiếu RCA.");
                return;
            }
            if (!r.verification || !r.verification.trim()) {
                alert("Phiếu RCA chỉ được đóng (hoàn tất) sau khi nhập Đánh giá hiệu quả (Bước 6 - Xác nhận hiệu quả).");
                return;
            }

            r.status = 'completed';
            r.completedAt = getCurrentTimestamp();
            persistRcaEditingRecord();

            if (r.item) {
                await writeDeviceRcaFile(r.item);
            }

            alert(`Đã hoàn tất phiếu RCA${r.item ? ` cho thiết bị "${r.item}"` : ''}!${logDirHandle ? ' Đã sao lưu vào thư mục "logdata".' : ' (Chưa kết nối thư mục "logdata" nên chưa sao lưu file — vào "📁 Quản lý dữ liệu" > "📂 Chọn thư mục dự án" để kết nối.)'}`);
            closeRcaEditor();
            renderRcaList();
        }

        // --- IN PHIẾU RCA ---
        function printRcaRecord(id) {
            const r = findRcaRecordById(id);
            if (!r) { alert("Không tìm thấy phiếu RCA này!"); return; }

            const impactLabel = { low: '<span style="color:#22c55e;">●</span> Thấp — không ảnh hưởng sản xuất', medium: '<span style="color:#eab308;">●●</span> Trung bình — ảnh hưởng cục bộ', high: '<span style="color:#f97316;">●●●</span> Cao — dừng máy/dây chuyền', critical: '<span style="color:#ef4444;">●●●●</span> Nghiêm trọng — an toàn/thiệt hại lớn' };
            const categoryLabel = {};
            RCA_ISHIKAWA_META.forEach(m => categoryLabel[m.key] = `${m.icon} ${m.label}`);
            const fmtDate = (d) => d ? String(d).split('-').reverse().join('/') : '—';
            const personName = (v) => v && v.trim() ? rcaEsc(v) : '—';

            // "Người thực hiện" = danh sách người phụ trách (không trùng lặp) trong các hành động khắc phục/phòng ngừa
            const performerNames = [...new Set((r.correctiveActions || []).map(a => (a.owner || '').trim()).filter(Boolean))];
            const performerText = performerNames.length > 0 ? rcaEsc(performerNames.join(', ')) : '—';

            const whyRows = r.fiveWhys.map((w, idx) => `
                <tr><td style="width:22%; font-weight:bold;">${RCA_WHY_LABELS[idx]}</td><td>${rcaEsc(w) || '—'}</td></tr>
            `).join('');

            const ishikawaRows = RCA_ISHIKAWA_META.map(m => `
                <tr><td style="width:22%; font-weight:bold;">${m.icon} ${m.label}</td><td>${rcaEsc(r.ishikawa[m.key]) || '—'}</td></tr>
            `).join('');

            const validActions = (r.correctiveActions || []).filter(a => a.action && a.action.trim());
            const actionRows = validActions.length > 0 ? validActions.map((a, idx) => `
                <tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td>${rcaEsc(a.action)}</td>
                    <td>${a.type === 'preventive' ? 'Phòng ngừa' : 'Khắc phục'}</td>
                    <td>${personName(a.owner)}</td>
                    <td>${fmtDate(a.dueDate)}</td>
                    <td>${a.status === 'done' ? '✅ Hoàn thành' : (a.status === 'in_progress' ? '▶️ Đang thực hiện' : '🕓 Chưa thực hiện')}</td>
                </tr>
            `).join('') : `<tr><td colspan="6" style="text-align:center; color:#555;">Chưa có hành động nào</td></tr>`;

            const info = getCompanyInfo();

            const bodyHtml = `
                <table style="margin-bottom:20px;">
                    <tr><td style="width:22%; font-weight:bold;">Nhà máy</td><td style="width:28%;">${rcaEsc(info.lineName) || '—'}</td><td style="width:22%; font-weight:bold;">Khu vực</td><td>${rcaEsc(r.area) || '—'}</td></tr>
                    <tr><td style="font-weight:bold;">Người phân tích</td><td>${personName(r.reportedBy)}</td><td style="font-weight:bold;">Người thực hiện</td><td>${performerText}</td></tr>
                    <tr><td style="font-weight:bold;">Mã thiết bị</td><td>${rcaEsc(r.item) || '—'}</td><td style="font-weight:bold;">Chức năng</td><td>${rcaEsc(r.name) || '—'}</td></tr>
                    <tr><td style="font-weight:bold;">Ngày ghi nhận sự cố</td><td>${fmtDate(r.problemDate)}</td><td style="font-weight:bold;">Mức độ ảnh hưởng</td><td>${impactLabel[r.impact] || '—'}</td></tr>
                </table>

                <h3 style="margin-bottom:6px;">1. Mô tả vấn đề / sự cố</h3>
                <table style="margin-bottom:20px;"><tr><td>${rcaEsc(r.problemDescription).replace(/\n/g, '<br>') || '—'}</td></tr></table>

                <h3 style="margin-bottom:6px;">2. Phân tích 5 Why</h3>
                <table style="margin-bottom:20px;"><tbody>${whyRows}</tbody></table>

                <h3 style="margin-bottom:6px;">3. Sơ đồ xương cá — 6M</h3>
                <table style="margin-bottom:20px;"><tbody>${ishikawaRows}</tbody></table>

                <h3 style="margin-bottom:6px;">4. Nguyên nhân gốc rễ</h3>
                <table style="margin-bottom:20px;">
                    <tr><td style="width:22%; font-weight:bold;">Thuộc nhóm nguyên nhân</td><td>${categoryLabel[r.rootCauseCategory] || '—'}</td></tr>
                    <tr><td style="font-weight:bold;">Kết luận nguyên nhân gốc rễ</td><td>${rcaEsc(r.rootCause).replace(/\n/g, '<br>') || '—'}</td></tr>
                </table>

                <h3 style="margin-bottom:6px;">5. Hành động khắc phục / phòng ngừa</h3>
                <table style="margin-bottom:20px;">
                    <thead><tr><th style="width:5%;">STT</th><th>Hành động</th><th style="width:12%;">Loại</th><th style="width:16%;">Người phụ trách</th><th style="width:12%;">Hạn hoàn thành</th><th style="width:14%;">Trạng thái</th></tr></thead>
                    <tbody>${actionRows}</tbody>
                </table>

                <h3 style="margin-bottom:6px;">6. Xác nhận hiệu quả</h3>
                <table style="margin-bottom:20px;"><tr><td>${rcaEsc(r.verification).replace(/\n/g, '<br>') || '—'}</td></tr></table>

                <div class="footer-sig">
                    <div class="sig-box">
                        <p><strong>Người phân tích</strong></p>
                        <span style="font-size:11px; color:#555;">(Ký & ghi rõ họ tên)</span>
                        <br><br><br><br><br>
                        <p>${personName(r.reportedBy) !== '—' ? personName(r.reportedBy) : '.......................................'}</p>
                    </div>
                    <div class="sig-box">
                        <p><strong>Người thực hiện</strong></p>
                        <span style="font-size:11px; color:#555;">(Ký & ghi rõ họ tên)</span>
                        <br><br><br><br><br>
                        <p>${performerText !== '—' ? performerText : '.......................................'}</p>
                    </div>
                    <div class="sig-box">
                        <p><strong>Trưởng phòng KTCL</strong></p>
                        <span style="font-size:11px; color:#555;">(Phê duyệt)</span>
                        <br><br><br><br><br>
                        <p>.......................................</p>
                    </div>
                </div>
            `;

            openPrintWindow('PHIẾU PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (RCA)', '', bodyHtml);
        }

        // --- XUẤT CSV DANH SÁCH PHIẾU RCA CỦA 1 THIẾT BỊ ---
        function buildDeviceRcaCsv(itemCode) {
            const entries = (rcaRecords[itemCode] || []).filter(r => r.status === 'completed').slice().sort((a, b) => (a.completedAt < b.completedAt ? -1 : 1));
            const header = [
                'STT', 'Ngày xảy ra sự cố', 'Người phân tích', 'Mức độ ảnh hưởng', 'Mô tả vấn đề',
                'Why 1', 'Why 2', 'Why 3', 'Why 4', 'Why 5',
                'Con người', 'Máy móc', 'Phương pháp', 'Vật liệu', 'Đo lường', 'Môi trường',
                'Nhóm nguyên nhân gốc', 'Nguyên nhân gốc rễ',
                'Hành động khắc phục/phòng ngừa', 'Đánh giá hiệu quả', 'Hoàn tất lúc'
            ];
            const impactLabel = { low: 'Thấp', medium: 'Trung bình', high: 'Cao', critical: 'Nghiêm trọng' };
            const categoryLabel = {};
            RCA_ISHIKAWA_META.forEach(m => categoryLabel[m.key] = m.label);
            const lines = [header.map(csvEscape).join(',')];
            entries.forEach((e, idx) => {
                const actionsText = (e.correctiveActions || [])
                    .filter(a => a.action && a.action.trim())
                    .map(a => `[${a.type === 'preventive' ? 'Phòng ngừa' : 'Khắc phục'}] ${a.action} (PT: ${a.owner || '—'}, hạn: ${a.dueDate || '—'})`)
                    .join('; ');
                lines.push([
                    idx + 1,
                    e.problemDate || '',
                    e.reportedBy || '',
                    impactLabel[e.impact] || '',
                    e.problemDescription || '',
                    e.fiveWhys[0] || '', e.fiveWhys[1] || '', e.fiveWhys[2] || '', e.fiveWhys[3] || '', e.fiveWhys[4] || '',
                    e.ishikawa.human || '', e.ishikawa.machine || '', e.ishikawa.method || '', e.ishikawa.material || '', e.ishikawa.measurement || '', e.ishikawa.environment || '',
                    categoryLabel[e.rootCauseCategory] || '',
                    e.rootCause || '',
                    actionsText,
                    e.verification || '',
                    e.completedAt || ''
                ].map(csvEscape).join(','));
            });
            return '\uFEFF' + lines.join('\r\n');
        }

        async function writeDeviceRcaFile(itemCode) {
            if (!logDirHandle) return;
            try {
                const options = { mode: 'readwrite' };
                if (await logDirHandle.queryPermission(options) !== 'granted') {
                    if (await logDirHandle.requestPermission(options) !== 'granted') {
                        console.warn("Không có quyền ghi phiếu RCA vào thư mục nhật ký.");
                        return;
                    }
                }
                const fileName = sanitizeFileName(itemCode) + '_RCA.csv';
                const fileHandle = await logDirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(buildDeviceRcaCsv(itemCode));
                await writable.close();
            } catch (err) {
                console.error("Lỗi ghi file phiếu RCA:", err);
                alert(`Không thể tự động ghi file RCA cho thiết bị "${itemCode}" (thư mục "logdata" có thể đã bị di chuyển/mất quyền).`);
            }
        }
