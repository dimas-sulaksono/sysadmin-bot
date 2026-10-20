require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');

const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.CHAT_ID;
const bot = new TelegramBot(token, { polling: true });

// Register Native Bot Menu Commands
bot.setMyCommands([
    { command: 'start', description: 'Mulai / Tampilkan Dasbor' },
    { command: 'status', description: 'Cek Dasbor Utama' },
    { command: 'restart', description: 'Restart Servis' },
    { command: 'logs', description: 'Ambil Log Servis' },
    { command: 'deploy', description: 'Manual Deploy / Update' },
    { command: 'network', description: 'Cek Status Jaringan' },
    { command: 'tailscale', description: 'Kontrol / Hidupkan Tailscale VPN' },
    { command: 'speedtest', description: 'Uji Kecepatan Internet' },
    { command: 'backup', description: 'Backup Konfigurasi Sistem ke Telegram' },
    { command: 'dbbackup', description: 'Backup Database MySQL' }
]);

const runCmd = (cmd, timeout = 5000) => new Promise((resolve) => {
    exec(cmd, { shell: '/bin/bash', timeout }, (error, stdout, stderr) => {
        resolve(stdout || stderr || (error ? error.message : ''));
    });
});

const menuKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: '📊 Dasbor Utama' }],
            [{ text: '🔄 Restart Servis' }, { text: '📜 Ambil Log' }],
            [{ text: '🚀 Manual Deploy' }, { text: '🕸️ Jaringan' }],
            [{ text: '📦 Backup Config' }, { text: '🗄️ Backup DB' }],
            [{ text: '⚡ Speedtest' }, { text: '🛡️ Tailscale' }]
        ],
        resize_keyboard: true,
        is_persistent: true
    },
    parse_mode: 'Markdown'
};

async function handleRestartMenu(msg) {
    if (msg.chat.id.toString() !== chatId) return;
    bot.sendMessage(chatId, 'Pilih servis yang ingin di-*restart*:', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: 'sysadmin-bot', callback_data: 'restart_sysadmin-bot' }, { text: 'vermi-web', callback_data: 'restart_vermi-web' }],
                [{ text: 'cloudflare-tunnel', callback_data: 'restart_cloudflare-tunnel' }, { text: 'mariadb', callback_data: 'restart_mariadb' }]
            ]
        }
    });
}

async function handleFetchLogsMenu(msg) {
    if (msg.chat.id.toString() !== chatId) return;
    bot.sendMessage(chatId, 'Pilih servis untuk mengambil *Log* (15 Baris Terakhir):', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: 'sysadmin-bot', callback_data: 'logs_sysadmin-bot' }, { text: 'vermi-web', callback_data: 'logs_vermi-web' }],
                [{ text: 'cloudflare-tunnel', callback_data: 'logs_cloudflare-tunnel' }, { text: 'mariadb', callback_data: 'logs_mariadb' }]
            ]
        }
    });
}

async function handleDeploy(msg) {
    if (msg.chat.id.toString() !== chatId) return;
    bot.sendMessage(chatId, '🚀 *Memulai Manual Deploy...*', { parse_mode: 'Markdown' });
    const out = await runCmd("bash /root/scripts/deploy-sysadmin-bot.sh", 15000);
    bot.sendMessage(chatId, `\`\`\`text\n${out.substring(0, 3900)}\n\`\`\``, { parse_mode: 'Markdown' });
}

async function getTailscaleInfo() {
    let isDaemonRunning = false;
    let isConnected = false;
    let ip = "N/A";
    let statusText = "Mati";
    let statusRaw = "";

    try {
        const pgrep = await runCmd("pgrep tailscaled");
        isDaemonRunning = pgrep.trim().length > 0;
    } catch (e) {}

    if (isDaemonRunning) {
        try {
            statusRaw = await runCmd("tailscale status", 5000);
            if (statusRaw && !statusRaw.toLowerCase().includes("tailscale is stopped") && !statusRaw.toLowerCase().includes("logged out")) {
                isConnected = true;
                statusText = "🟢 Aktif / Terhubung";
                const ipOut = await runCmd("tailscale ip -4", 3000);
                ip = ipOut.trim().split('\n')[0] || "N/A";
            } else {
                statusText = "🟡 Daemon Jalan (Status: Stopped)";
            }
        } catch (e) {
            statusText = "⚠️ Error membaca status";
        }
    } else {
        statusText = "🔴 Mati (Daemon tailscaled tidak berjalan)";
    }

    return { isDaemonRunning, isConnected, ip, statusText, statusRaw };
}

async function handleTailscaleMenu(msg, editMessageId = null) {
    const targetChatId = (msg && msg.chat) ? msg.chat.id.toString() : chatId;
    if (targetChatId !== chatId) return;

    const info = await getTailscaleInfo();

    const text = `🛡️ *KONTROL TAILSCALE VPN (JARAK JAUH)*

📡 *Status:* ${info.statusText}
🌐 *IP VPN:* \`${info.ip}\`
⚙️ *Daemon:* ${info.isDaemonRunning ? '🟢 Running' : '🔴 Inactive'}

Pilih menu di bawah untuk mengontrol koneksi:`;

    const reply_markup = {
        inline_keyboard: [
            [
                { text: '🟢 Hidupkan (Up)', callback_data: 'ts_up' },
                { text: '🔴 Matikan (Down)', callback_data: 'ts_down' }
            ],
            [
                { text: '🔄 Restart Service', callback_data: 'ts_restart' },
                { text: '📱 Buka App Android', callback_data: 'ts_app' }
            ],
            [
                { text: '👥 List Perangkat (Peers)', callback_data: 'ts_peers' },
                { text: '🔄 Refresh Status', callback_data: 'ts_refresh' }
            ]
        ]
    };

    if (editMessageId) {
        try {
            await bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId, parse_mode: 'Markdown', reply_markup });
        } catch (e) { }
    } else {
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup });
    }
}

async function handleNetwork(msg) {
    if (msg.chat.id.toString() !== chatId) return;
    bot.sendMessage(chatId, '🕸️ *Mengecek Jaringan...*', { parse_mode: 'Markdown' });
    const tailscale = await runCmd("tailscale status");
    const ping = await runCmd("curl -I -s https://api.telegram.org -m 3 | head -n 1");
    const out = `=== Tailscale ===\n${tailscale.trim()}\n\n=== Ping Telegram API ===\n${ping.trim()}`;
    bot.sendMessage(chatId, `\`\`\`text\n${out.substring(0, 3900)}\n\`\`\``, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛡️ Kelola Tailscale', callback_data: 'open_ts_menu' }]
            ]
        }
    });
}

async function handleSpeedtest(msg) {
    if (msg.chat.id.toString() !== chatId) return;
    bot.sendMessage(chatId, '⚡ *Memulai Speedtest...* (Estimasi 30-40 detik)', { parse_mode: 'Markdown' });
    const out = await runCmd("curl -s https://raw.githubusercontent.com/sivel/speedtest-cli/master/speedtest.py | python3 - --simple", 60000);
    bot.sendMessage(chatId, `=== Hasil Speedtest ===\n\`\`\`text\n${out.trim()}\n\`\`\``, { parse_mode: 'Markdown' });
}

async function handleBackup(msg) {
    if (msg.chat.id.toString() !== chatId) return;
    bot.sendMessage(chatId, '📦 *Mempersiapkan Backup...*', { parse_mode: 'Markdown' });
    const backupCmd = `tar -czvf /tmp/vps-backup-$(date +%Y%m%d).tar.gz /root/sysadmin-bot/.env /root/.pm2/dump.pm2 /root/scripts /etc/init-portfolio.sh 2>/dev/null || true`;
    
    try {
        await runCmd(backupCmd, 10000);
        const filenameOut = await runCmd("ls /tmp/vps-backup-*.tar.gz | head -n 1");
        const filename = filenameOut.trim();
        if (filename) {
            await bot.sendDocument(chatId, filename, { 
                caption: '🛡️ *Backup VPS Berhasil!*\n\nFile ini berisi kredensial `.env`, tabel servis PM2, dan skrip *custom* Anda. Simpan dengan aman!', 
                parse_mode: 'Markdown' 
            });
            await runCmd(`rm -f ${filename}`);
        } else {
            bot.sendMessage(chatId, '❌ Gagal membuat file backup.');
        }
    } catch(e) {
        bot.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses backup.');
    }
}

async function handleDbBackupMenu(msg) {
    if (msg.chat.id.toString() !== chatId) return;
    try {
        const out = await runCmd("mysql -u sysadmin -pAquosBackup123\\! -e 'SHOW DATABASES;' | grep -Ev '^(Database|information_schema|performance_schema|mysql|sys)$'");
        const dbs = out.trim().split('\n').filter(db => db.length > 0);
        
        if (dbs.length === 0) {
            bot.sendMessage(chatId, '❌ Tidak ditemukan database custom.');
            return;
        }

        // Susun inline keyboard: 1 baris maksimal 2 tombol
        const buttons = [];
        for (let i = 0; i < dbs.length; i += 2) {
            const row = [{ text: `💾 ${dbs[i]}`, callback_data: `dump_${dbs[i]}` }];
            if (i + 1 < dbs.length) {
                row.push({ text: `💾 ${dbs[i+1]}`, callback_data: `dump_${dbs[i+1]}` });
            }
            buttons.push(row);
        }

        bot.sendMessage(chatId, '🗄️ Pilih *Database* yang ingin di-*backup*:', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
    } catch (e) {
        bot.sendMessage(chatId, '❌ Gagal mengambil daftar database.');
    }
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

// Callback handler for Inline Keyboards
bot.on('callback_query', async (query) => {
    if (query.message.chat.id.toString() !== chatId) return;
    const action = query.data;
    
    if (action.startsWith('restart_')) {
        const app = action.replace('restart_', '');
        bot.answerCallbackQuery(query.id, { text: `Mereset ${app}...` });
        bot.editMessageText(`🔄 Mereset \`${app}\`...`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
        await runCmd(`pm2 restart ${app}`);
        bot.editMessageText(`✅ Servis \`${app}\` berhasil di-restart!`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
    }
    
    if (action.startsWith('logs_')) {
        const app = action.replace('logs_', '');
        bot.answerCallbackQuery(query.id, { text: `Mengambil log ${app}...` });
        const logs = await runCmd(`pm2 logs ${app} --lines 15 --nostream`);
        bot.editMessageText(`📜 *Logs: ${app}*\n\`\`\`text\n${logs.substring(0, 3900)}\n\`\`\``, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
    }

    if (action.startsWith('dump_')) {
        const dbName = action.replace('dump_', '');
        bot.answerCallbackQuery(query.id, { text: `Mengekstrak ${dbName}...` });
        bot.editMessageText(`🗄️ *Mengekstrak database:* \`${dbName}\`...`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
        
        const backupFile = `/tmp/${dbName}-backup-$(date +%Y%m%d%H%M).sql.gz`;
        await runCmd(`mysqldump -u sysadmin -pAquosBackup123\\! ${dbName} 2>/dev/null | gzip > ${backupFile}`, 30000);
        const filenameOut = await runCmd(`ls ${backupFile} | head -n 1`);
        const filename = filenameOut.trim();
        
        if (filename && filename.endsWith('.gz')) {
            await bot.sendDocument(chatId, filename, { 
                caption: `🗄️ *Backup Database Berhasil!*\n\nDatabase: \`${dbName}\`\nKompresi: \`GZIP\``, 
                parse_mode: 'Markdown' 
            });
            await runCmd(`rm -f ${filename}`);
            bot.editMessageText(`✅ *Backup Selesai:* \`${dbName}\``, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
        } else {
            bot.editMessageText(`❌ *Gagal mengekstrak:* \`${dbName}\``, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
        }
    }

    if (action === 'open_ts_menu') {
        bot.answerCallbackQuery(query.id);
        handleTailscaleMenu(query.message);
    }

    if (action === 'ts_up') {
        bot.answerCallbackQuery(query.id, { text: 'Menghidupkan Tailscale...' });
        bot.editMessageText('🚀 *Menghidupkan Tailscale...*\nMemeriksa daemon dan mengaktifkan VPN...', {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });

        const daemonCheck = await runCmd("pgrep tailscaled");
        if (!daemonCheck.trim()) {
            await runCmd("nohup tailscaled --tun=userspace-networking --socks5-server=localhost:1055 > /var/log/tailscaled.log 2>&1 &");
            await new Promise(r => setTimeout(r, 2000));
        }

        const upOut = await runCmd("tailscale up --ssh 2>&1 || tailscale up 2>&1", 15000);
        const ipOut = await runCmd("tailscale ip -4", 3000);
        const currentIp = ipOut.trim().split('\n')[0] || "N/A";

        bot.sendMessage(chatId, `✅ *Tailscale Berhasil Dihidupkan!*\n🌐 *IP:* \`${currentIp}\`\n\n\`\`\`text\n${upOut.trim() || 'Tailscale is now online'}\n\`\`\``, {
            parse_mode: 'Markdown'
        });
        setTimeout(() => handleTailscaleMenu(null), 1000);
    }

    if (action === 'ts_down') {
        bot.answerCallbackQuery(query.id, { text: 'Mematikan Tailscale...' });
        bot.editMessageText('⚠️ *Mematikan koneksi Tailscale...*', {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });

        const downOut = await runCmd("tailscale down 2>&1", 10000);
        bot.sendMessage(chatId, `🔴 *Tailscale Berhasil Dimatikan*\n\`\`\`text\n${downOut.trim() || 'Tailscale is stopped.'}\n\`\`\``, {
            parse_mode: 'Markdown'
        });
        setTimeout(() => handleTailscaleMenu(null), 1000);
    }

    if (action === 'ts_restart') {
        bot.answerCallbackQuery(query.id, { text: 'Mereset Tailscale...' });
        bot.editMessageText('🔄 *Mereset Daemon & Koneksi Tailscale...*', {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });

        await runCmd("tailscale down 2>&1 || true");
        await runCmd("pkill tailscaled 2>&1 || true");
        await new Promise(r => setTimeout(r, 1500));
        await runCmd("nohup tailscaled --tun=userspace-networking --socks5-server=localhost:1055 > /var/log/tailscaled.log 2>&1 &");
        await new Promise(r => setTimeout(r, 2000));
        const upRes = await runCmd("tailscale up --ssh 2>&1 || tailscale up 2>&1", 15000);
        const newIp = (await runCmd("tailscale ip -4", 3000)).trim().split('\n')[0] || "N/A";

        bot.sendMessage(chatId, `✅ *Tailscale Berhasil Direstart!*\n🌐 *IP Baru:* \`${newIp}\`\n\n\`\`\`text\n${upRes.trim() || 'Tailscale running cleanly'}\n\`\`\``, {
            parse_mode: 'Markdown'
        });
        setTimeout(() => handleTailscaleMenu(null), 1000);
    }

    if (action === 'ts_app') {
        bot.answerCallbackQuery(query.id, { text: 'Membuka Tailscale di Android...' });
        try {
            await runCmd("ssh -o StrictHostKeyChecking=no -p 8022 127.0.0.1 '/system/bin/am start -n com.tailscale.ipn/.MainActivity 2>/dev/null || true'");
            bot.sendMessage(chatId, '📱 *Perintah Terkirim!* Membuka aplikasi Tailscale Android di layar HP.', { parse_mode: 'Markdown' });
        } catch (e) {
            bot.sendMessage(chatId, '❌ Gagal mengirim perintah ke Android Termux.', { parse_mode: 'Markdown' });
        }
    }

    if (action === 'ts_peers') {
        bot.answerCallbackQuery(query.id, { text: 'Mengambil daftar peers...' });
        const peers = await runCmd("tailscale status", 10000);
        bot.sendMessage(chatId, `👥 *Daftar Perangkat Tailscale*\n\`\`\`text\n${peers.trim().substring(0, 3900)}\n\`\`\``, {
            parse_mode: 'Markdown'
        });
    }

    if (action === 'ts_refresh') {
        bot.answerCallbackQuery(query.id, { text: 'Memperbarui status...' });
        await handleTailscaleMenu(null, query.message.message_id);
    }
});

// Commands
bot.onText(/\/status/, handleStatus);
bot.onText(/\/restart/, handleRestartMenu);
bot.onText(/\/logs/, handleFetchLogsMenu);
bot.onText(/\/deploy/, handleDeploy);
bot.onText(/\/network/, handleNetwork);
bot.onText(/\/tailscale/, (msg) => handleTailscaleMenu(msg));
bot.onText(/\/speedtest/, handleSpeedtest);
bot.onText(/\/backup/, handleBackup);
bot.onText(/\/dbbackup/, handleDbBackupMenu);

// Text buttons
bot.on('message', (msg) => {
    if (msg.text === '📊 Dasbor Utama') handleStatus(msg);
    if (msg.text === '🔄 Restart Servis') handleRestartMenu(msg);
    if (msg.text === '📜 Ambil Log') handleFetchLogsMenu(msg);
    if (msg.text === '🚀 Manual Deploy') handleDeploy(msg);
    if (msg.text === '🕸️ Jaringan') handleNetwork(msg);
    if (msg.text === '🛡️ Tailscale') handleTailscaleMenu(msg);
    if (msg.text === '⚡ Speedtest') handleSpeedtest(msg);
    if (msg.text === '📦 Backup Config') handleBackup(msg);
    if (msg.text === '🗄️ Backup DB') handleDbBackupMenu(msg);
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
