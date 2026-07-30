        // ================================================================
        // MODULE: FMEA (FAILURE MODE & EFFECTS ANALYSIS)
        // ================================================================
        let fmeaRecords = {}; // { "MÃ_THIẾT_BỊ": [ {id, item, name, area, func, failureMode, effect, cause, severity, occurrence, detection, currentControls, actions[], revisedSeverity, revisedOccurrence, revisedDetection, status, createdAt, updatedAt} ] }
        let fmeaEditingRecord = null;

        function saveFmeaRecordsToStorage() {
            localStorage.setItem('fmeaRecords', JSON.stringify(fmeaRecords));
            if (appMode === 'drive' && driveFmeaFolderId) driveSyncJsonFile(driveFmeaFolderId, 'fmeaRecords.json', fmeaRecords);
        }
        function loadFmeaRecordsFromStorage() {
            try { fmeaRecords = JSON.parse(localStorage.getItem('fmeaRecords') || '{}'); } catch (e) { fmeaRecords = {}; }
        }
        function getAllFmeaRecordsFlat() { return Object.values(fmeaRecords).flat(); }
        function findFmeaRecordById(id) { return getAllFmeaRecordsFlat().find(r => r.id === id) || null; }
        function fmeaGenId() { return 'fmea_' + Date.now() + Math.random().toString(36).substr(2, 5); }

        function fmeaRpn(r, revised) {
            const s = revised ? (parseInt(r.revisedSeverity) || parseInt(r.severity) || 0) : (parseInt(r.severity) || 0);
            const o = revised ? (parseInt(r.revisedOccurrence) || parseInt(r.occurrence) || 0) : (parseInt(r.occurrence) || 0);
            const d = revised ? (parseInt(r.revisedDetection) || parseInt(r.detection) || 0) : (parseInt(r.detection) || 0);
            return s * o * d;
        }
        function fmeaRpnBand(rpn) {
            if (rpn >= 200) return { label: 'Rất cao', cls: 'fmea-rpn-critical' };
            if (rpn >= 100) return { label: 'Cao', cls: 'fmea-rpn-high' };
            if (rpn >= 50) return { label: 'Trung bình', cls: 'fmea-rpn-medium' };
            return { label: 'Thấp', cls: 'fmea-rpn-low' };
        }

        function createFmeaRecord() {
            return {
                id: fmeaGenId(), item: '', name: '', area: '',
                func: '', failureMode: '', effect: '', cause: '',
                severity: 5, occurrence: 5, detection: 5,
                currentControls: '',
                actions: [{ id: 'a' + Date.now(), action: '', owner: '', dueDate: '', status: 'pending' }],
                revisedSeverity: '', revisedOccurrence: '', revisedDetection: '',
                status: 'open', // open | monitoring | closed
                createdAt: getCurrentTimestamp(), updatedAt: getCurrentTimestamp()
            };
        }

        function openFmeaEditor(id) {
            if (id) {
                fmeaEditingRecord = findFmeaRecordById(id);
            } else {
                fmeaEditingRecord = createFmeaRecord();
                const key = '_chua_gan_thiet_bi_';
                if (!fmeaRecords[key]) fmeaRecords[key] = [];
                fmeaRecords[key].push(fmeaEditingRecord);
            }
            document.getElementById('fmeaListView').classList.add('hidden');
            document.getElementById('fmeaEditorView').classList.remove('hidden');
            renderFmeaEditor();
        }

        function closeFmeaEditor() {
            fmeaEditingRecord = null;
            document.getElementById('fmeaEditorView')?.classList.add('hidden');
            document.getElementById('fmeaListView')?.classList.remove('hidden');
        }

        // Đổi mã thiết bị của 1 bản ghi FMEA thì cần dời nó sang đúng key trong fmeaRecords
        function fmeaRelocateRecordKey(record, newItem) {
            Object.keys(fmeaRecords).forEach(key => {
                fmeaRecords[key] = fmeaRecords[key].filter(r => r.id !== record.id);
            });
            const key = newItem || '_chua_gan_thiet_bi_';
            if (!fmeaRecords[key]) fmeaRecords[key] = [];
            fmeaRecords[key].push(record);
        }

        // Cập nhật field văn bản đơn giản — KHÔNG render lại để tránh mất con trỏ khi đang gõ
        function updateFmeaField(field, value) {
            if (!fmeaEditingRecord) return;
            fmeaEditingRecord[field] = value;
            fmeaEditingRecord.updatedAt = getCurrentTimestamp();
        }

        // Cập nhật điểm S/O/D (thường/sau cải tiến) — render lại để cập nhật badge RPN (chỉ fire khi rời khỏi ô)
        function updateFmeaScore(field, value) {
            if (!fmeaEditingRecord) return;
            fmeaEditingRecord[field] = value;
            fmeaEditingRecord.updatedAt = getCurrentTimestamp();
            renderFmeaEditor();
        }

        function updateFmeaDeviceSelect(sel) {
            if (!fmeaEditingRecord) return;
            const opt = sel.options[sel.selectedIndex];
            const item = sel.value;
            const name = opt ? (opt.getAttribute('data-name') || '') : '';
            fmeaRelocateRecordKey(fmeaEditingRecord, item);
            fmeaEditingRecord.item = item;
            fmeaEditingRecord.name = name;
            fmeaEditingRecord.updatedAt = getCurrentTimestamp();
            renderFmeaEditor();
        }

        function addFmeaActionRow() {
            if (!fmeaEditingRecord) return;
            fmeaEditingRecord.actions.push({ id: 'a' + Date.now(), action: '', owner: '', dueDate: '', status: 'pending' });
            renderFmeaEditor();
        }
        function removeFmeaActionRow(idx) {
            if (!fmeaEditingRecord) return;
            fmeaEditingRecord.actions.splice(idx, 1);
            renderFmeaEditor();
        }
        function updateFmeaAction(idx, field, value) {
            if (!fmeaEditingRecord) return;
            fmeaEditingRecord.actions[idx][field] = value;
        }

        function saveFmeaRecord() {
            if (!fmeaEditingRecord) return;
            if (!fmeaEditingRecord.item && !confirm('Chưa chọn thiết bị cho dạng sai hỏng này. Vẫn lưu?')) return;
            fmeaEditingRecord.updatedAt = getCurrentTimestamp();
            saveFmeaRecordsToStorage();
            closeFmeaEditor();
            renderFmeaList();
        }

        function deleteFmeaRecord(id) {
            showDeleteConfirm('Xóa bản ghi FMEA này? Hành động không thể hoàn tác.', () => {
                Object.keys(fmeaRecords).forEach(key => { fmeaRecords[key] = fmeaRecords[key].filter(r => r.id !== id); });
                saveFmeaRecordsToStorage();
                closeFmeaEditor();
                renderFmeaList();
            });
        }

        // Các phiếu RCA đã liên kết tới 1 bản ghi FMEA (thông qua r.linkedFmeaId)
        function getLinkedRcaRecords(fmeaId) {
            return getAllRcaRecordsFlat().filter(r => r.linkedFmeaId === fmeaId);
        }

        // Gợi ý điểm Tần suất (Occurrence) dựa trên số lần RCA thực tế đã liên kết
        function suggestFmeaOccurrence(linkedCount) {
            if (linkedCount <= 0) return null;
            if (linkedCount === 1) return 3;
            if (linkedCount <= 3) return 5;
            if (linkedCount <= 6) return 7;
            if (linkedCount <= 10) return 8;
            return 10;
        }
        function applyFmeaOccurrenceSuggestion() {
            if (!fmeaEditingRecord) return;
            const linked = getLinkedRcaRecords(fmeaEditingRecord.id);
            const suggestion = suggestFmeaOccurrence(linked.length);
            if (!suggestion) { alert('Chưa có phiếu RCA nào liên kết với dạng sai hỏng này để gợi ý.'); return; }
            fmeaEditingRecord.occurrence = suggestion;
            renderFmeaEditor();
        }

        // Tạo lệnh công việc phòng ngừa từ hành động đề xuất trong FMEA (dùng chung form Work Order)
        function createWorkOrderFromFmea() {
            if (!fmeaEditingRecord) return;
            const r = fmeaEditingRecord;
            const actionTexts = (r.actions || []).filter(a => a.action && a.action.trim()).map(a => a.action);
            const rpn = fmeaRpn(r);
            openCreateWorkOrder({
                title: `Phòng ngừa FMEA — ${r.item || ''}${r.failureMode ? ': ' + r.failureMode : ''}`,
                type: 'Bảo trì định kỳ',
                priority: rpn >= 200 ? 'critical' : (rpn >= 100 ? 'urgent' : 'normal'),
                device: r.item || '',
                description: actionTexts.length > 0 ? actionTexts.join('; ') : (r.currentControls || ''),
                sourceRef: { fmeaId: r.id }
            });
        }

        // --- DANH SÁCH FMEA ---
        function renderFmeaList() {
            const container = document.getElementById('fmeaListContainer');
            const summaryEl = document.getElementById('fmeaSummaryStrip');
            if (!container) return;

            let all = getAllFmeaRecordsFlat().map(r => Object.assign({}, r, { _rpn: fmeaRpn(r) }));
            const sortSel = document.getElementById('fmeaSortSelect');
            const sortMode = sortSel ? sortSel.value : 'rpn_desc';
            all.sort((a, b) => sortMode === 'item' ? String(a.item).localeCompare(String(b.item)) : (b._rpn - a._rpn));

            if (summaryEl) {
                const critical = all.filter(r => r._rpn >= 200).length;
                const high = all.filter(r => r._rpn >= 100 && r._rpn < 200).length;
                summaryEl.innerHTML = `
                    <div class="fmea-summary-chip">Tổng số dạng sai hỏng <strong>${all.length}</strong></div>
                    <div class="fmea-summary-chip">🔴 RPN rất cao (≥200) <strong>${critical}</strong></div>
                    <div class="fmea-summary-chip">🟠 RPN cao (100-199) <strong>${high}</strong></div>
                `;
            }

            if (all.length === 0) {
                container.innerHTML = `<div class="italic text-center p-20" style="color: var(--text-muted); margin-top: 30px;">Chưa có dữ liệu FMEA nào. Bấm "➕ Thêm dạng sai hỏng mới" để bắt đầu phân tích.</div>`;
                return;
            }

            container.innerHTML = all.map(r => {
                const band = fmeaRpnBand(r._rpn);
                const linkedCount = getLinkedRcaRecords(r.id).length;
                return `
                    <div class="fmea-list-card" onclick="openFmeaEditor('${r.id}')">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <span class="fmea-rpn-badge ${band.cls}">RPN ${r._rpn} — ${band.label}</span>
                                ${linkedCount > 0 ? `<span class="rca-source-pill">🔍 ${linkedCount} phiếu RCA liên kết</span>` : ''}
                            </div>
                            <span style="font-size:0.72rem; color: var(--text-muted);">S${r.severity} × O${r.occurrence} × D${r.detection}</span>
                        </div>
                        <div style="margin-top:6px;">
                            <strong style="color:white; font-size:0.85rem;">${rcaEsc(r.item || '(chưa gắn thiết bị)')}</strong>
                            <span style="color: var(--text-muted); font-size:0.8rem;"> — ${rcaEsc(r.name || '')}</span>
                        </div>
                        <div style="font-size:0.78rem; color: var(--text-muted); margin-top:4px;">
                            <strong style="color:#ddd;">Dạng sai hỏng:</strong> ${rcaEsc(r.failureMode || '(chưa nhập)')}
                        </div>
                        <div style="font-size:0.76rem; color: var(--text-muted); margin-top:2px; white-space:pre-wrap;">${rcaEsc((r.effect || '').slice(0, 140))}</div>
                    </div>
                `;
            }).join('');
        }

        // --- TRÌNH SOẠN THẢO 1 BẢN GHI FMEA ---
        function renderFmeaEditor() {
            const editorView = document.getElementById('fmeaEditorView');
            if (!editorView || !fmeaEditingRecord) return;
            const r = fmeaEditingRecord;
            const rpn = fmeaRpn(r);
            const band = fmeaRpnBand(rpn);
            const hasRevised = r.revisedSeverity || r.revisedOccurrence || r.revisedDetection;
            const revisedRpn = hasRevised ? fmeaRpn(r, true) : null;
            const revisedBand = revisedRpn !== null ? fmeaRpnBand(revisedRpn) : null;

            const linkedRca = getLinkedRcaRecords(r.id);
            const suggestion = suggestFmeaOccurrence(linkedRca.length);

            const actionRowsHtml = r.actions.map((a, idx) => `
                <tr>
                    <td style="width:32%;"><input type="text" value="${rcaEsc(a.action)}" placeholder="Hành động phòng ngừa/kiểm soát..." oninput="updateFmeaAction(${idx}, 'action', this.value)"></td>
                    <td style="width:20%;"><select onchange="updateFmeaAction(${idx}, 'owner', this.value)">${personnelOptionsHtml(a.owner)}</select></td>
                    <td style="width:16%;"><input type="date" value="${rcaEsc(a.dueDate)}" oninput="updateFmeaAction(${idx}, 'dueDate', this.value)"></td>
                    <td style="width:18%;">
                        <select onchange="updateFmeaAction(${idx}, 'status', this.value)">
                            <option value="pending" ${a.status === 'pending' ? 'selected' : ''}>🕓 Chưa thực hiện</option>
                            <option value="in_progress" ${a.status === 'in_progress' ? 'selected' : ''}>▶️ Đang thực hiện</option>
                            <option value="done" ${a.status === 'done' ? 'selected' : ''}>✅ Hoàn thành</option>
                        </select>
                    </td>
                    <td style="width:4%; text-align:center;"><button type="button" class="rca-remove-row-btn" onclick="removeFmeaActionRow(${idx})">✖</button></td>
                </tr>
            `).join('');

            const linkedRcaHtml = linkedRca.length > 0 ? linkedRca.map(rc => `
                <div class="fmea-rca-link-item">
                    <span>🔍 ${rcaEsc(rc.problemDate || '')} — ${rcaEsc((rc.problemDescription || '').slice(0, 80))}</span>
                    <span class="rca-status-pill ${rc.status}">${rc.status === 'completed' ? '✅' : '📝'}</span>
                </div>
            `).join('') : `<div class="italic" style="color: var(--text-muted); font-size:0.75rem;">Chưa có phiếu RCA nào liên kết. Khi tạo/sửa phiếu RCA cho thiết bị này, chọn đúng dạng sai hỏng này ở mục "🧩 Liên kết FMEA" để ghi nhận.</div>`;

            editorView.innerHTML = `
                <div class="rca-editor-header">
                    <button class="rca-back-btn" onclick="closeFmeaEditor(); renderFmeaList();">← Quay lại danh sách</button>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span class="fmea-rpn-badge ${band.cls}">RPN hiện tại: ${rpn} (${band.label})</span>
                        ${revisedRpn !== null ? `<span class="fmea-rpn-badge ${revisedBand.cls}">RPN sau cải tiến: ${revisedRpn} (${revisedBand.label})</span>` : ''}
                        <button type="button" class="btn btn-slate" style="padding:5px 10px; font-size:0.72rem;" onclick="deleteFmeaRecord('${r.id}')">🗑️ Xóa</button>
                    </div>
                </div>

                ${rpn >= 100 ? `
                <div style="background: rgba(249,115,22,0.1); border:1px solid rgba(249,115,22,0.3); border-radius:8px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                    <span style="font-size:0.8rem; color:#fb923c;">⚠️ RPN đang ở mức ưu tiên cao — nên có hành động phòng ngừa cụ thể.</span>
                    <button type="button" class="btn btn-sky" style="padding:5px 10px; font-size:0.75rem;" onclick="createWorkOrderFromFmea()">📋 Tạo lệnh công việc phòng ngừa</button>
                </div>` : ''}

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">1</span> Thông tin thiết bị & chức năng</div>
                    <div class="rca-field-row">
                        <div class="rca-field">
                            <label>Thiết bị</label>
                            <select class="search-input" onchange="updateFmeaDeviceSelect(this)">${buildWoDeviceOptions(r.item)}</select>
                        </div>
                        <div class="rca-field">
                            <label>Khu vực</label>
                            <input type="text" class="search-input" value="${rcaEsc(r.area)}" oninput="updateFmeaField('area', this.value)">
                        </div>
                        <div class="rca-field">
                            <label>Trạng thái</label>
                            <select class="search-input" onchange="updateFmeaField('status', this.value)">
                                <option value="open" ${r.status === 'open' ? 'selected' : ''}>🟡 Đang mở</option>
                                <option value="monitoring" ${r.status === 'monitoring' ? 'selected' : ''}>👁️ Đang theo dõi</option>
                                <option value="closed" ${r.status === 'closed' ? 'selected' : ''}>✅ Đã đóng</option>
                            </select>
                        </div>
                    </div>
                    <div class="rca-field-row" style="margin-bottom:0;">
                        <div class="rca-field" style="flex-basis:100%;">
                            <label>Chức năng của thiết bị/chi tiết</label>
                            <textarea class="log-textarea" style="min-height:40px;" oninput="updateFmeaField('func', this.value)">${rcaEsc(r.func)}</textarea>
                        </div>
                    </div>
                </div>

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">2</span> Dạng sai hỏng & ảnh hưởng</div>
                    <div class="rca-field-row" style="margin-bottom:0;">
                        <div class="rca-field" style="flex-basis:100%;">
                            <label>Dạng sai hỏng (Failure Mode) — nó hỏng theo kiểu gì?</label>
                            <textarea class="log-textarea" style="min-height:40px;" oninput="updateFmeaField('failureMode', this.value)">${rcaEsc(r.failureMode)}</textarea>
                        </div>
                    </div>
                    <div class="rca-field-row" style="margin-bottom:0;">
                        <div class="rca-field" style="flex-basis:100%;">
                            <label>Ảnh hưởng (Effect) — hậu quả nếu xảy ra</label>
                            <textarea class="log-textarea" style="min-height:40px;" oninput="updateFmeaField('effect', this.value)">${rcaEsc(r.effect)}</textarea>
                        </div>
                    </div>
                    <div class="rca-field-row" style="margin-bottom:0;">
                        <div class="rca-field" style="flex-basis:100%;">
                            <label>Nguyên nhân (Cause) — vì sao xảy ra</label>
                            <textarea class="log-textarea" style="min-height:40px;" oninput="updateFmeaField('cause', this.value)">${rcaEsc(r.cause)}</textarea>
                        </div>
                    </div>
                </div>

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">3</span> Đánh giá rủi ro hiện tại (thang điểm 1-10)</div>
                    <div class="rca-field-row">
                        <div class="rca-field">
                            <label>Mức nghiêm trọng (S)</label>
                            <input type="number" min="1" max="10" class="search-input fmea-sod-input" value="${r.severity}" onchange="updateFmeaScore('severity', this.value)">
                        </div>
                        <div class="rca-field">
                            <label>Tần suất (O)${suggestion ? ` — <span style="color:var(--color-sky); cursor:pointer; font-size:0.7rem;" onclick="applyFmeaOccurrenceSuggestion()">💡 Gợi ý: ${suggestion} (áp dụng)</span>` : ''}</label>
                            <input type="number" min="1" max="10" class="search-input fmea-sod-input" value="${r.occurrence}" onchange="updateFmeaScore('occurrence', this.value)">
                        </div>
                        <div class="rca-field">
                            <label>Khả năng phát hiện (D)</label>
                            <input type="number" min="1" max="10" class="search-input fmea-sod-input" value="${r.detection}" onchange="updateFmeaScore('detection', this.value)">
                        </div>
                    </div>
                    <div class="rca-field-row" style="margin-bottom:0;">
                        <div class="rca-field" style="flex-basis:100%;">
                            <label>Biện pháp kiểm soát hiện tại</label>
                            <textarea class="log-textarea" style="min-height:40px;" oninput="updateFmeaField('currentControls', this.value)">${rcaEsc(r.currentControls)}</textarea>
                        </div>
                    </div>
                </div>

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">4</span> Hành động đề xuất</div>
                    <table class="fmea-actions-table">
                        <thead><tr><th>Hành động</th><th>Người phụ trách</th><th>Hạn hoàn thành</th><th>Trạng thái</th><th></th></tr></thead>
                        <tbody>${actionRowsHtml}</tbody>
                    </table>
                    <button type="button" class="rca-add-row-btn" onclick="addFmeaActionRow()">➕ Thêm hành động</button>
                </div>

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">5</span> Đánh giá lại sau cải tiến (tùy chọn)</div>
                    <div class="rca-field-row">
                        <div class="rca-field">
                            <label>S sau cải tiến</label>
                            <input type="number" min="1" max="10" class="search-input fmea-sod-input" value="${r.revisedSeverity}" onchange="updateFmeaScore('revisedSeverity', this.value)">
                        </div>
                        <div class="rca-field">
                            <label>O sau cải tiến</label>
                            <input type="number" min="1" max="10" class="search-input fmea-sod-input" value="${r.revisedOccurrence}" onchange="updateFmeaScore('revisedOccurrence', this.value)">
                        </div>
                        <div class="rca-field">
                            <label>D sau cải tiến</label>
                            <input type="number" min="1" max="10" class="search-input fmea-sod-input" value="${r.revisedDetection}" onchange="updateFmeaScore('revisedDetection', this.value)">
                        </div>
                    </div>
                </div>

                <div class="rca-section">
                    <div class="rca-section-title"><span class="badge-num">6</span> Phiếu RCA liên kết (${linkedRca.length})</div>
                    <div class="rca-section-sub">Các sự cố thực tế đã xảy ra khớp với dạng sai hỏng này — được liên kết từ chính phiếu RCA tương ứng (mục "🧩 Liên kết FMEA").</div>
                    ${linkedRcaHtml}
                </div>

                <div class="log-actions" style="justify-content:space-between; align-items:center;">
                    <span style="font-size:0.7rem; color: var(--text-muted);">${r.createdAt ? `Tạo lúc: ${r.createdAt}` : ''}${r.updatedAt ? ` • Cập nhật lúc: ${r.updatedAt}` : ''}</span>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button type="button" class="btn btn-slate" onclick="closeFmeaEditor(); renderFmeaList();">Hủy</button>
                        <button type="button" class="btn btn-violet" onclick="saveFmeaRecord()">💾 Lưu bản ghi FMEA</button>
                    </div>
                </div>
            `;
        }
        // ================================================================
