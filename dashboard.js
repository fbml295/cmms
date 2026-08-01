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
            let dueSoonCount = 0;
            const overdueDevices = [];
            const dueSoonDevices = [];
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
                } else if (status.isDueSoon) {
                    dueSoonCount++;
                    dueSoonDevices.push({ device, cycles: status.dueSoonCycles });
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

            let dueSoonListHtml = '';
            if (dueSoonDevices.length === 0) {
                dueSoonListHtml = `<div class="italic" style="color: var(--text-muted); font-size: 0.85rem; padding: 10px 0;">Không có thiết bị nào sắp đến hạn trong 7 ngày tới.</div>`;
            } else {
                dueSoonListHtml = '<div class="overdue-list">';
                dueSoonDevices.slice(0, 30).forEach(o => {
                    dueSoonListHtml += `
                        <div class="overdue-item" style="border-left-color: var(--color-amber);">
                            <div class="overdue-item-name">
                                <strong>${o.device.item} — ${o.device.name}</strong>
                                <span>${o.device.cabinet ? 'Tủ: ' + o.device.cabinet : ''}</span>
                            </div>
                            <span class="overdue-item-badge" style="background: rgba(245,158,11,0.15); color: var(--color-amber); border-color: rgba(245,158,11,0.35);">Sắp đến hạn: ${o.cycles.join(', ')}</span>
                        </div>
                    `;
                });
                dueSoonListHtml += '</div>';
                if (dueSoonDevices.length > 30) {
                    dueSoonListHtml += `<div class="italic" style="color: var(--text-muted); font-size: 0.78rem; margin-top: 8px;">... và ${dueSoonDevices.length - 30} thiết bị sắp đến hạn khác.</div>`;
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
                    <div class="stat-card c-amber">
                        <div class="stat-icon">🔔</div>
                        <div class="stat-label">Sắp đến hạn (≤7 ngày)</div>
                        <div class="stat-value">${dueSoonCount}</div>
                        <div class="stat-sub">Chủ động chuẩn bị nhân lực/vật tư trước</div>
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

                <div class="dashboard-section-title">🔔 Sắp đến hạn bảo trì (trong 7 ngày tới)</div>
                <div class="dashboard-split-panel">
                    ${dueSoonListHtml}
                </div>
            `;
        }

        // --- CÔNG THỨC TÍNH NGÀY KẾ HOẠCH ---
