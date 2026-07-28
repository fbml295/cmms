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

