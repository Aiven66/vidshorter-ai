const $ = (id) => document.getElementById(id);

function append(line) {
  const box = $('logBox');
  box.textContent += `${line}\n`;
  box.scrollTop = box.scrollHeight;
}

async function init() {
  const data = await window.agent.getConfig();
  $('serverUrl').value = data.config.serverUrl || '';
  $('agentId').value = data.config.agentId || '';
  $('secret').value = '';
  $('logPath').textContent = data.logFilePath ? `Log: ${data.logFilePath}` : '';
  $('logBox').textContent = '';
  (data.logs || []).forEach(append);

  window.agent.onLog(append);

  $('save').onclick = async () => {
    const serverUrl = $('serverUrl').value.trim();
    const agentId = $('agentId').value.trim();
    const secret = $('secret').value;
    await window.agent.saveConfig({
      serverUrl,
      agentId,
      ...(secret ? { secret } : {}),
    });
    $('secret').value = '';
    append('saved');
  };

  $('logs').onclick = async () => {
    await window.agent.openLogs();
  };

  $('copy').onclick = async () => {
    await window.agent.copyLogs();
    append('copied');
  };
}

init();
