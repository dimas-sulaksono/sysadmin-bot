require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');

const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.CHAT_ID;
const bot = new TelegramBot(token, { polling: true });

// Register Native Bot Menu Commands
bot.setMyCommands([
    { command: 'start', description: 'Mulai / Tampilkan Keyboard' },
    { command: 'suhu', description: 'Cek Suhu CPU' },
    { command: 'status', description: 'Cek Status (RAM, Disk, Baterai)' },
    { command: 'services', description: 'Cek Services' }
]);

const runCmd = (cmd, timeout = 5000) => new Promise((resolve) => {
    exec(cmd, { shell: '/bin/bash', timeout }, (error, stdout, stderr) => {
        resolve(stdout || stderr || (error ? error.message : ''));
    });
});

const menuKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: '🌡️ Cek Suhu' }, { text: '📊 Cek Status' }],
            [{ text: '⚙️ Services' }]
        ],
        resize_keyboard: true,
        is_persistent: true
    },
    parse_mode: 'Markdown'
};

async function handleSuhu(msg) {
    if (msg.chat.id.toString() !== chatId) return;
    const stdout = await runCmd("paste <(cat /sys/class/thermal/thermal_zone*/type 2>/dev/null) <(cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null) | grep -E 'cpu-[0-9]-[0-9]-usr'");
    const result = stdout.trim().split('\n').map(l => {
        const parts = l.split(/\s+/);
        if (parts.length < 2) return '';
        const temp = parseFloat(parts[1]) / 1000;
        if (temp > 0) return `- ${parts[0]}: ${temp} °C`;
        return '';
    }).filter(l => l).sort().join('\n');
    bot.sendMessage(chatId, '=== Suhu CPU ===\n' + result);
}

async function handleStatus(msg) {
    if (msg.chat.id.toString() !== chatId) return;

    bot.sendChatAction(chatId, 'typing');
    try {
        let uptimeStr = "N/A";
        try {
            const upRaw = await runCmd("ssh -o StrictHostKeyChecking=no -p 8022 127.0.0.1 uptime");
            const upMatch = upRaw.match(/up\s+(.*?),\s+\d+\s+users/);
            if (upMatch) uptimeStr = upMatch[1];
        } catch (e) { }

        const makeBar = (pct) => {
            const p = Math.min(10, Math.max(0, Math.round(parseFloat(pct) / 10)));
            return '[' + '█'.repeat(p) + '░'.repeat(10 - p) + ']';
        };

        const freeOut = await runCmd("free -b");
        const freeLines = freeOut.trim().split('\n');
        const mem = freeLines[1].split(/\s+/);
        const totalRam = parseInt(mem[1]);
        const usedRam = totalRam - parseInt(mem[6]);
        const ramPct = ((usedRam / totalRam) * 100).toFixed(1);
        const ramBar = makeBar(ramPct);
        const ramStr = `├ RAM  ${ramBar} ${ramPct.padStart(5, ' ')}% | ${String((usedRam / 1073741824).toFixed(1)).padStart(5, ' ')}/${String((totalRam / 1073741824).toFixed(1)).padStart(5, ' ')}GB`;

        let swapStr = '├ Swap N/A';
        if (freeLines.length > 2 && freeLines[2].startsWith('Swap:')) {
            const swapArr = freeLines[2].split(/\s+/);
            const totalSwap = parseInt(swapArr[1]);
            const usedSwap = parseInt(swapArr[2]);
            const swapPct = totalSwap > 0 ? ((usedSwap / totalSwap) * 100).toFixed(1) : "0.0";
            const swapBar = makeBar(swapPct);
            swapStr = `├ Swap ${swapBar} ${swapPct.padStart(5, ' ')}% | ${String((usedSwap / 1073741824).toFixed(1)).padStart(5, ' ')}/${String((totalSwap / 1073741824).toFixed(1)).padStart(5, ' ')}GB`;
        }

        const dfOut = await runCmd("df -B1 /");
        const dfLines = dfOut.trim().split('\n');
        const diskArr = dfLines[dfLines.length - 1].split(/\s+/);
        const totalDisk = parseInt(diskArr[1]);
        const usedDisk = parseInt(diskArr[2]);
        const diskPct = parseFloat(diskArr[4]).toFixed(1);
        const diskBar = makeBar(diskPct);
        const diskStr = `└ Disk ${diskBar} ${diskPct.padStart(5, ' ')}% | ${String((usedDisk / 1073741824).toFixed(1)).padStart(5, ' ')}/${String((totalDisk / 1073741824).toFixed(1)).padStart(5, ' ')}GB`;

        let cpuUsageStr = "N/A";
        try {
            const psOut = await runCmd("ssh -o StrictHostKeyChecking=no -p 8022 127.0.0.1 'ps -A -o %cpu'");
            let sum = 0;
            psOut.trim().split('\n').forEach(line => {
                const val = parseFloat(line.trim());
                if (!isNaN(val)) sum += val;
            });
            const overallPct = (sum / 8).toFixed(1);
            const cpuBar = makeBar(overallPct);
            cpuUsageStr = `├ CPU  ${cpuBar} ${overallPct.padStart(5, ' ')}%`;
        } catch (e) { }

        let batStr = 'N/A';
        let genTempStr = 'N/A';
        try {
            const termuxBatOut = await runCmd("ssh -o StrictHostKeyChecking=no -p 8022 127.0.0.1 'termux-battery-status'", 3000);
            const batJson = JSON.parse(termuxBatOut);
            const isCharging = batJson.status === 'CHARGING' || batJson.plugged !== 'UNPLUGGED';
            const chargeText = isCharging ? '(Charging)' : '(Not Charging)';
            batStr = `${batJson.percentage}% ${chargeText}`;
            genTempStr = `${String(batJson.temperature.toFixed(1)).padStart(5, ' ')}°C`;
        } catch (e) { }

        let cpuTempStr = "";
        try {
            const stdout = await runCmd("paste <(cat /sys/class/thermal/thermal_zone*/type 2>/dev/null) <(cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null) | grep -E 'cpu-[0-9]-[0-9]-usr'");
            const temps = [];
            stdout.trim().split('\n').forEach(l => {
                const parts = l.split(/\s+/);
                if (parts.length >= 2) {
                    const temp = parseFloat(parts[1]) / 1000;
                    if (temp > 0) {
                        const label = parts[0].replace('cpu-', '').replace('-usr', '');
                        temps.push(`[${label}] ${temp.toFixed(1)}`);
                    }
                }
            });
            temps.sort();
            for (let i = 0; i < temps.length; i += 2) {
                if (i + 1 < temps.length) {
                    cpuTempStr += `${temps[i].padEnd(12)} ${temps[i + 1]}\n`;
                } else {
                    cpuTempStr += `${temps[i]}\n`;
                }
            }
        } catch (e) { }

        let servicesStr = "";
        try {
            const pm2Out = await runCmd("pm2 jlist");
            const list = JSON.parse(pm2Out);
            list.forEach(app => {
                const isOnline = app.pm2_env.status === 'online';
                const statusIcon = isOnline ? '🟢' : '🔴';
                let usage = isOnline ? '' : 'stopped';
                if (isOnline && app.monit) {
                    const memMB = (app.monit.memory / 1024 / 1024).toFixed(1) + 'MB';
                    const cpu = (app.monit.cpu || 0).toFixed(1) + '%';
                    usage = `${cpu.padStart(5, ' ')} | ${memMB.padStart(8, ' ')}`;
                }
                const namePadded = app.name.padEnd(20, ' ');
                // Menggunakan inline monospace agar emoji tetap berwarna namun teks sejajar
                servicesStr += `${statusIcon} \`${namePadded} ${usage}\`\n`;
            });
        } catch (e) { }

        const finalMsg = `*VPS SYSTEM MONITOR* 
⏱ Uptime: ${uptimeStr}

📊 *Resource Usage*
\`\`\`text
${cpuUsageStr}
${ramStr}
${swapStr}
${diskStr}
\`\`\`

📱 *Device Health*
\`\`\`text
├ Baterai ${batStr}
└ Suhu    ${genTempStr}
\`\`\`

🔥 *CPU Temps (°C)*
\`\`\`text
${cpuTempStr.trim()}
\`\`\`

⚙️ *Services*
${servicesStr.trim()}`;

        bot.sendMessage(chatId, finalMsg, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, 'Error generating dashboard');
    }
}

async function handleServices(msg) {
    if (msg.chat.id.toString() !== chatId) return;
    exec('pm2 jlist', (err, stdout) => {
        try {
            const list = JSON.parse(stdout);
            let response = '=== Services ===\n';
            list.forEach(app => {
                const isOnline = app.pm2_env.status === 'online';
                const status = isOnline ? '✅' : '❌';
                let usage = isOnline ? '' : ' (stopped)';
                if (isOnline && app.monit) {
                    const memMB = (app.monit.memory / 1024 / 1024).toFixed(1) + 'MB';
                    const cpu = app.monit.cpu + '%';
                    usage = ` [CPU: ${cpu} | RAM: ${memMB}]`;
                }
                response += `${status} ${app.name}${usage}\n`;
            });
            bot.sendMessage(chatId, response);
        } catch (e) {
            bot.sendMessage(chatId, 'Gagal membaca PM2 jlist.');
        }
    });
}

// Commands
bot.onText(/\/suhu/, handleSuhu);
bot.onText(/\/status/, handleStatus);
bot.onText(/\/services/, handleServices);

// Text buttons
bot.on('message', (msg) => {
    if (msg.text === '🌡️ Cek Suhu') handleSuhu(msg);
    if (msg.text === '📊 Cek Status') handleStatus(msg);
    if (msg.text === '⚙️ Services') handleServices(msg);
});

bot.onText(/\/start/, (msg) => {
    if (msg.chat.id.toString() !== chatId) return;
    bot.sendMessage(chatId, '🤖 *SysAdmin Bot Aktif!*\n\nGunakan menu cepat di bawah untuk mengontrol server.', menuKeyboard);
});

let lastTempWarn = 0;
let serviceStates = {};

setInterval(() => {
    const tempCmd = "paste <(cat /sys/class/thermal/thermal_zone*/type 2>/dev/null) <(cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null) | grep -E 'cpu-[0-9]-[0-9]-usr'";
    exec(tempCmd, { shell: '/bin/bash' }, (err, stdout) => {
        try {
            const lines = stdout.trim().split('\n');
            let sum = 0, n = 0;
            lines.forEach(l => {
                const parts = l.split(/\s+/);
                if (parts.length >= 2) {
                    const temp = parseFloat(parts[1]) / 1000;
                    if (temp > 0) { sum += temp; n++; }
                }
            });
            if (n > 0) {
                const avgTemp = sum / n;
                if (avgTemp > 65) {
                    const now = Date.now();
                    if (now - lastTempWarn > 30 * 60 * 1000) {
                        bot.sendMessage(chatId, `⚠️ *Peringatan Suhu!* ⚠️\nSuhu rata-rata CPU menyentuh *${avgTemp.toFixed(1)}°C*!`, { parse_mode: 'Markdown' });
                        lastTempWarn = now;
                    }
                } else if (avgTemp < 50) {
                    lastTempWarn = 0;
                }
            }
        } catch (e) { }
    });

    exec('pm2 jlist', (err, stdout) => {
        try {
            const list = JSON.parse(stdout);
            list.forEach(app => {
                const name = app.name;
                const status = app.pm2_env.status;
                if (name === 'sysadmin-bot') return;
                if (serviceStates[name] && serviceStates[name] === 'online' && status !== 'online') {
                    bot.sendMessage(chatId, `🚨 *Peringatan Servis!* 🚨\nAplikasi *${name}* baru saja mati (Status: ${status}).`, { parse_mode: 'Markdown' });
                }
                serviceStates[name] = status;
            });
        } catch (e) { }
    });
}, 60 * 1000);

console.log('Bot is running with pure clean code (Uptime + Termux API via SSH)...');
