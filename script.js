// Generate Mock Data
const generateMockData = (count) => {
    const data = [];
    const opds = ['OPD General', 'OPD Cardio', 'OPD Neuro', 'OPD Ortho'];
    const nations = ['Thai', 'Myanmar', 'Lao', 'Cambodian', 'European'];
    const riskGroups = ['Low', 'Medium', 'High'];
    const riskTypes = ['Type A', 'Type B', 'Type C'];
    
    // Some addresses with comma, some without
    const addresses = [
        '123 Sukhumvit, Bangkok, 10110', 
        '456 Silom Road Bangkok', 
        'Village 4, Chiang Mai, 50000', 
        'Phuket Town Center',
        '99/1 Rama 9, Huai Khwang, BKK',
        'Pattaya Chonburi Thailand'
    ];

    for (let i = 1; i <= count; i++) {
        const date = new Date(2026, 9, Math.floor(Math.random() * 30) + 1); // Random date in Oct 2026
        data.push({
            id: `PT-${1000 + i}`,
            date: date.toISOString().split('T')[0],
            addr: addresses[Math.floor(Math.random() * addresses.length)],
            opd: opds[Math.floor(Math.random() * opds.length)],
            nation: nations[Math.floor(Math.random() * nations.length)],
            risk_group: riskGroups[Math.floor(Math.random() * riskGroups.length)],
            risk_type: riskTypes[Math.floor(Math.random() * riskTypes.length)]
        });
    }
    return data;
};

// ==========================================
// GOOGLE SHEETS INTEGRATION
// ==========================================
const SHEET_ID = '1m6jy95C82D4pWs2MaanSmnxLvPlJC7tJ';
const SHEET_GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=responseHandler:parseGoogleSheetJSONP`;

// Google Apps Script Web App URL สำหรับบันทึกข้อมูลย้อนกลับเข้า Google Sheet
let GOOGLE_SCRIPT_WEBAPP_URL = localStorage.getItem('clinic_google_webapp_url') || '';

let rawData = [];
let filteredData = [];

// Global Chart Instances
let charts = {};

// Setup Google Visualization API fallback receiver globally
window.google = window.google || {};
window.google.visualization = window.google.visualization || {};
window.google.visualization.Query = window.google.visualization.Query || {};
window.google.visualization.Query.setResponse = function(response) {
    if (typeof window.parseGoogleSheetJSONP === 'function') {
        window.parseGoogleSheetJSONP(response);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setupExcelImport();
    const tbody = document.getElementById('tableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 40px; color: #94a3b8;">กำลังโหลดข้อมูลจาก Google Sheets...</td></tr>';

    try {
        // Try fetch API first (if supported or running via web server)
        fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`)
            .then(res => res.text())
            .then(text => {
                // Parse GViz JSON response: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
                const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
                if (match && match[1]) {
                    const jsonData = JSON.parse(match[1]);
                    window.parseGoogleSheetJSONP(jsonData);
                } else {
                    throw new Error("Unable to parse GViz JSON response format");
                }
            })
            .catch(err => {
                console.warn("Fetch failed (likely local file:// CORS), switching to JSONP script injection:", err);
                loadViaScriptTag();
            });
    } catch (mainErr) {
        loadViaScriptTag();
    }
});

function loadViaScriptTag() {
    const jsonpUrl = SHEET_GVIZ_URL + '&_t=' + new Date().getTime(); // cache buster
    const script = document.createElement('script');
    script.src = jsonpUrl;
    script.onerror = function() {
        showError("ไม่สามารถเชื่อมต่อกับ Google Sheets ได้ โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต");
    };
    document.body.appendChild(script);
}

// Function to extract OPD / IPD department from ADDR string
function extractOpdFromAddr(rawAddr) {
    if (!rawAddr || typeof rawAddr !== 'string') return 'ไม่ระบุ OPD';
    const str = rawAddr.trim();
    const match = str.match(/(OPD|IPD)[^,\d]+/i);
    if (match) {
        return match[0].trim();
    }
    return 'ไม่ระบุ OPD';
}

// Callback Function for Google Sheet JSONP
window.parseGoogleSheetJSONP = function(response) {
    try {
        if (!response) {
            showError("ไม่ได้รับข้อมูลจาก Google Sheets");
            return;
        }

        if (response.status === 'error') {
            const msg = response.errors && response.errors[0] ? response.errors[0].message : 'Unknown error';
            showError("Google Sheets Error: " + msg);
            return;
        }

        if (!response.table || !response.table.cols || !response.table.rows) {
            showError("โครงสร้างข้อมูล Google Sheet ไม่ถูกต้อง");
            return;
        }

        const cols = response.table.cols.map(c => c ? (c.label || c.id || '') : '');
        const rows = response.table.rows;

        const getVal = (row, colName) => {
            if (!row || !row.c) return '';
            let idx = cols.findIndex(c => c && c.trim().toLowerCase() === colName.trim().toLowerCase());
            if (idx === -1) {
                idx = cols.findIndex(c => c && c.toLowerCase().includes(colName.toLowerCase()));
            }
            if (idx === -1 || !row.c[idx]) return '';
            const cell = row.c[idx];
            if (cell.v === null || cell.v === undefined) return '';
            let val = String(cell.v).trim();
            // Format YYYYMMDD date format to YYYY-MM-DD
            if (colName.toLowerCase().includes('date') && val.length === 8 && /^\d{8}$/.test(val)) {
                val = `${val.substring(0,4)}-${val.substring(4,6)}-${val.substring(6,8)}`;
            }
            return val;
        };

        rawData = rows.map((row, index) => {
            let hn = getVal(row, 'DT07_HN') || getVal(row, 'HN') || getVal(row, 'DT07_NHSO_ID') || getVal(row, 'No') || getVal(row, 'ID') || `PT-${1000 + index + 1}`;
            let name = getVal(row, 'PNAME') || '';
            let date = getVal(row, 'DT07_START_DATE') || getVal(row, 'DT07_DATE_REGIS') || getVal(row, 'Date') || '-';
            
            let addr = getVal(row, 'ADDR') || getVal(row, 'Address');
            let mu = getVal(row, 'MU');
            let tam = getVal(row, 'TAMBON_PATIENT') || getVal(row, 'PTAMBON_NAME');
            let ampRaw = (getVal(row, 'AMPUR_PATIENT') || getVal(row, 'PAMPUR_NAME') || getVal(row, 'AMPUR_NAME')).trim();
            let prov = getVal(row, 'CHANGWAT_PATIENT') || getVal(row, 'PCHANGWAT_NAME') || getVal(row, 'DT07_CHANGWAT');

            let addrParts = [];
            if (addr) addrParts.push(addr);
            if (mu) addrParts.push('ม.' + mu);
            if (tam) addrParts.push('ต.' + tam);
            if (ampRaw) addrParts.push('อ.' + ampRaw);
            if (prov) addrParts.push('จ.' + prov);

            let fullAddr = addrParts.length > 0 ? addrParts.join(' ') : '-';
            let opd = extractOpdFromAddr(addr);
            let nation = getVal(row, 'NATION') || getVal(row, 'DT07_PEOPLE_TYPE') || getVal(row, 'Nationality') || '-';
            let risk_group = getVal(row, 'RISK_GROUP') || getVal(row, 'Risk Group') || '-';
            let risk_type = getVal(row, 'RISK_TYPE') || getVal(row, 'Risk Type') || '-';

            let ampArea = (ampRaw === 'เมืองเชียงราย' || ampRaw.includes('เมืองเชียงราย')) ? 'ในเขตอำเภอเมืองเชียงราย' : 'นอกเขต';

            return {
                id: hn,
                name: name,
                date: date,
                addr: fullAddr,
                rawAddr: addr,
                opd: opd,
                amp: ampArea,
                ampRaw: ampRaw,
                nation: nation,
                risk_group: risk_group,
                risk_type: risk_type
            };
        });

        rawData = rawData.filter(d => d.id !== '-' && d.id !== 'undefined' && d.id !== '');
        filteredData = [...rawData];
        
        if (rawData.length === 0) {
            showError("ไม่พบข้อมูลผู้ป่วยใน Google Sheet");
            return;
        }
        
        initializeDashboard();
    } catch (err) {
        showError("เกิดข้อผิดพลาดในการประมวลผลข้อมูล: " + err.message);
    }
};

function showError(msg) {
    console.error(msg);
    const tbody = document.getElementById('tableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: #ef4444; padding: 40px; font-weight: 500;">${msg}</td></tr>`;
    } else {
        alert(msg);
    }
}

function initializeDashboard() {
    try {
        initFilters();
        updateDashboard();

        document.getElementById('applyFilters').addEventListener('click', applyFilters);
        document.getElementById('resetFilters').addEventListener('click', resetFilters);
        document.getElementById('searchInput').addEventListener('input', applySearch);
    } catch (err) {
        showError("เกิดข้อผิดพลาดในการเตรียมแดชบอร์ด (initializeDashboard): " + err.message);
    }
}

function initFilters() {
    const opds = [...new Set(rawData.map(d => d.opd))];
    const nations = [...new Set(rawData.map(d => d.nation))];
    const riskGroups = [...new Set(rawData.map(d => d.risk_group))];

    populateSelect('opdFilter', opds);
    populateSelect('nationFilter', nations);
    populateSelect('riskGroupFilter', riskGroups);
}

function populateSelect(id, options) {
    const select = document.getElementById(id);
    if (!select) return;
    const firstOption = select.options[0];
    const firstText = firstOption ? firstOption.textContent : 'All';
    const firstVal = firstOption ? firstOption.value : 'all';
    select.innerHTML = `<option value="${firstVal}">${firstText}</option>`;
    options.filter(Boolean).sort().forEach(opt => {
        const el = document.createElement('option');
        el.value = opt;
        el.textContent = opt;
        select.appendChild(el);
    });
}

function applyFilters() {
    const start = document.getElementById('dateStart').value;
    const end = document.getElementById('dateEnd').value;
    const opd = document.getElementById('opdFilter').value;
    const nation = document.getElementById('nationFilter').value;
    const risk = document.getElementById('riskGroupFilter').value;

    filteredData = rawData.filter(d => {
        let match = true;
        if (start && d.date < start) match = false;
        if (end && d.date > end) match = false;
        if (opd !== 'all' && d.opd !== opd) match = false;
        if (nation !== 'all' && d.nation !== nation) match = false;
        if (risk !== 'all' && d.risk_group !== risk) match = false;
        return match;
    });

    applySearch(); 
}

function resetFilters() {
    document.getElementById('dateStart').value = '';
    document.getElementById('dateEnd').value = '';
    document.getElementById('opdFilter').value = 'all';
    document.getElementById('nationFilter').value = 'all';
    document.getElementById('riskGroupFilter').value = 'all';
    document.getElementById('searchInput').value = '';
    filteredData = [...rawData];
    updateDashboard();
}

function applySearch() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    if (term) {
        filteredData = filteredData.filter(d => 
            d.id.toLowerCase().includes(term) ||
            (d.name && d.name.toLowerCase().includes(term)) ||
            d.addr.toLowerCase().includes(term) ||
            d.nation.toLowerCase().includes(term) ||
            d.opd.toLowerCase().includes(term) ||
            (d.amp && d.amp.toLowerCase().includes(term)) ||
            (d.ampRaw && d.ampRaw.toLowerCase().includes(term))
        );
    }
    updateDashboard();
}

function updateDashboard() {
    updateSummaryCards();
    updateOpdSummaryTable();
    updateOpdDetailTable();
    updateRiskGroupDetailTable();
    updateRiskTypeDetailTable();
    updateAmpurDetailTable();
    updateTable();
    try {
        updateCharts();
    } catch (err) {
        console.error("Chart Error:", err);
    }
}

function updateOpdSummaryTable() {
    const tbody = document.getElementById('opdSummaryTableBody');
    const tfoot = document.getElementById('opdSummaryTableFoot');
    if (!tbody) return;

    const total = filteredData.length;
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    let opdCount = 0;
    let ipdCount = 0;
    let unkCount = 0;

    filteredData.forEach(d => {
        if (d.opd.startsWith('OPD')) opdCount++;
        else if (d.opd.startsWith('IPD')) ipdCount++;
        else unkCount++;
    });

    const opdPct = total > 0 ? ((opdCount / total) * 100).toFixed(2) : '0.00';
    const ipdPct = total > 0 ? ((ipdCount / total) * 100).toFixed(2) : '0.00';
    const unkPct = total > 0 ? ((unkCount / total) * 100).toFixed(2) : '0.00';

    tbody.innerHTML = `
        <tr>
            <td><span class="opd-dot green"></span> <strong>OPD</strong></td>
            <td>OPD (รวมทุกแผนกผู้ป่วยนอก)</td>
            <td style="text-align: right; font-weight: 600;">${opdCount.toLocaleString()}</td>
            <td style="text-align: right; font-weight: 600; color: #10b981;">${opdPct}%</td>
        </tr>
        <tr>
            <td><span class="opd-dot orange"></span> <strong>IPD</strong></td>
            <td>IPD (รวมทุกแผนกผู้ป่วยใน)</td>
            <td style="text-align: right; font-weight: 600;">${ipdCount.toLocaleString()}</td>
            <td style="text-align: right; font-weight: 600; color: #f59e0b;">${ipdPct}%</td>
        </tr>
        <tr>
            <td><span class="opd-dot grey"></span> <strong>ไม่ระบุ</strong></td>
            <td>ไม่ระบุ OPD / IPD (มีเฉพาะบ้านเลขที่/หมู่)</td>
            <td style="text-align: right; font-weight: 600;">${unkCount.toLocaleString()}</td>
            <td style="text-align: right; font-weight: 600; color: #94a3b8;">${unkPct}%</td>
        </tr>
    `;

    if (tfoot) {
        tfoot.innerHTML = `
            <tr>
                <td><strong>รวม</strong></td>
                <td><strong>รวมผู้ป่วยทั้งหมด</strong></td>
                <td style="text-align: right; font-weight: 700;">${total.toLocaleString()}</td>
                <td style="text-align: right; font-weight: 700; color: #3b82f6;">100.0%</td>
            </tr>
        `;
    }
}

function updateOpdDetailTable() {
    const tbody = document.getElementById('opdDetailTableBody');
    const tfoot = document.getElementById('opdDetailTableFoot');
    if (!tbody) return;

    const specificDepts = filteredData.filter(d => d.opd && d.opd !== 'ไม่ระบุ OPD');
    if (specificDepts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px;">ไม่พบข้อมูลแผนก OPD/IPD</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const deptCounts = {};
    specificDepts.forEach(d => {
        deptCounts[d.opd] = (deptCounts[d.opd] || 0) + 1;
    });

    const sortedDepts = Object.keys(deptCounts).sort((a, b) => deptCounts[b] - deptCounts[a]);

    let html = '';
    let grandTotal = 0;

    sortedDepts.forEach((dept, index) => {
        const count = deptCounts[dept];
        grandTotal += count;
        const dotClass = dept.startsWith('IPD') ? 'orange' : 'green';

        html += `
            <tr>
                <td style="text-align: center; color: var(--text-muted); font-weight: 500;">${index + 1}</td>
                <td><span class="opd-dot ${dotClass}"></span> <strong>${dept}</strong></td>
                <td style="text-align: right; font-weight: 600;">${count.toLocaleString()}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    if (tfoot) {
        tfoot.innerHTML = `
            <tr>
                <td style="text-align: center;"><strong>รวม</strong></td>
                <td><strong>รวมกลุ่ม OPD / IPD ทั้งหมด</strong></td>
                <td style="text-align: right; font-weight: 700; color: #10b981;">${grandTotal.toLocaleString()} คน</td>
            </tr>
        `;
    }
}

function updateRiskGroupDetailTable() {
    const tbody = document.getElementById('riskGroupDetailTableBody');
    const tfoot = document.getElementById('riskGroupDetailTableFoot');
    if (!tbody) return;

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px;">ไม่พบข้อมูลกลุ่มเสี่ยง</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const counts = {};
    filteredData.forEach(d => {
        const group = d.risk_group || 'ไม่ระบุกลุ่มเสี่ยง';
        counts[group] = (counts[group] || 0) + 1;
    });

    const sortedGroups = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    let html = '';
    let grandTotal = 0;

    sortedGroups.forEach((group, index) => {
        const count = counts[group];
        grandTotal += count;

        let dotClass = 'grey';
        if (group.includes('เสี่ยง') || group.includes('High')) dotClass = 'orange';
        else if (group.includes('ไม่มี') || group.includes('Low')) dotClass = 'green';

        html += `
            <tr>
                <td style="text-align: center; color: var(--text-muted); font-weight: 500;">${index + 1}</td>
                <td><span class="opd-dot ${dotClass}"></span> <strong>${group}</strong></td>
                <td style="text-align: right; font-weight: 600;">${count.toLocaleString()}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    if (tfoot) {
        tfoot.innerHTML = `
            <tr>
                <td style="text-align: center;"><strong>รวม</strong></td>
                <td><strong>รวมกลุ่มเสี่ยงทั้งหมด</strong></td>
                <td style="text-align: right; font-weight: 700; color: #3b82f6;">${grandTotal.toLocaleString()} คน</td>
            </tr>
        `;
    }
}

function updateRiskTypeDetailTable() {
    const tbody = document.getElementById('riskTypeDetailTableBody');
    const tfoot = document.getElementById('riskTypeDetailTableFoot');
    if (!tbody) return;

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px;">ไม่พบข้อมูลปัจจัย/ประเภทความเสี่ยง</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const counts = {};
    filteredData.forEach(d => {
        const type = d.risk_type || 'ไม่ระบุประเภทความเสี่ยง';
        counts[type] = (counts[type] || 0) + 1;
    });

    const sortedTypes = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    let html = '';
    let grandTotal = 0;

    sortedTypes.forEach((type, index) => {
        const count = counts[type];
        grandTotal += count;

        let dotClass = 'purple';
        if (type.includes('ไม่มี')) dotClass = 'green';

        html += `
            <tr>
                <td style="text-align: center; color: var(--text-muted); font-weight: 500;">${index + 1}</td>
                <td><span class="opd-dot ${dotClass}"></span> <strong>${type}</strong></td>
                <td style="text-align: right; font-weight: 600;">${count.toLocaleString()}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    if (tfoot) {
        tfoot.innerHTML = `
            <tr>
                <td style="text-align: center;"><strong>รวม</strong></td>
                <td><strong>รวมปัจจัย/ประเภทความเสี่ยงทั้งหมด</strong></td>
                <td style="text-align: right; font-weight: 700; color: #8b5cf6;">${grandTotal.toLocaleString()} คน</td>
            </tr>
        `;
    }
}

function updateAmpurDetailTable() {
    const tbody = document.getElementById('ampurDetailTableBody');
    const tfoot = document.getElementById('ampurDetailTableFoot');
    if (!tbody) return;

    const total = filteredData.length;
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">ไม่พบข้อมูลเขตพื้นที่</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    let inDistrictCount = 0;
    let outDistrictCount = 0;
    const outDistrictBreakdown = {};

    filteredData.forEach(d => {
        const raw = (d.ampRaw || '').trim();
        if (raw === 'เมืองเชียงราย' || raw.includes('เมืองเชียงราย')) {
            inDistrictCount++;
        } else {
            outDistrictCount++;
            const subName = raw && raw !== '-' ? raw : 'ไม่ระบุ';
            outDistrictBreakdown[subName] = (outDistrictBreakdown[subName] || 0) + 1;
        }
    });

    const inPct = total > 0 ? ((inDistrictCount / total) * 100).toFixed(2) : '0.00';
    const outPct = total > 0 ? ((outDistrictCount / total) * 100).toFixed(2) : '0.00';

    let html = '';
    // รายการที่ 1: ในเขตอำเภอเมืองเชียงราย
    html += `
        <tr>
            <td style="text-align: center; color: var(--text-muted); font-weight: 500;">1</td>
            <td><span class="opd-dot green"></span> <strong>ในเขตอำเภอเมืองเชียงราย</strong></td>
            <td style="text-align: right; font-weight: 600;">${inDistrictCount.toLocaleString()}</td>
            <td style="text-align: right; font-weight: 600; color: #10b981;">${inPct}%</td>
        </tr>
    `;

    // รายการที่ 2: นอกเขต (ยอดรวม)
    html += `
        <tr>
            <td style="text-align: center; color: var(--text-muted); font-weight: 500;">2</td>
            <td><span class="opd-dot orange"></span> <strong>นอกเขต</strong></td>
            <td style="text-align: right; font-weight: 600;">${outDistrictCount.toLocaleString()}</td>
            <td style="text-align: right; font-weight: 600; color: #f59e0b;">${outPct}%</td>
        </tr>
    `;

    // รายการอำเภอย่อยของนอกเขต เพื่อให้เลื่อนดูได้
    const sortedOut = Object.keys(outDistrictBreakdown).sort((a, b) => outDistrictBreakdown[b] - outDistrictBreakdown[a]);
    sortedOut.forEach((sub, idx) => {
        const cnt = outDistrictBreakdown[sub];
        const pct = total > 0 ? ((cnt / total) * 100).toFixed(2) : '0.00';
        html += `
            <tr style="opacity: 0.9; font-size: 0.95em;">
                <td style="text-align: center; color: var(--text-muted);">${idx + 3}</td>
                <td style="padding-left: 28px;"><span class="opd-dot grey"></span> นอกเขต (${sub})</td>
                <td style="text-align: right;">${cnt.toLocaleString()}</td>
                <td style="text-align: right; color: var(--text-muted);">${pct}%</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    if (tfoot) {
        tfoot.innerHTML = `
            <tr>
                <td style="text-align: center;"><strong>รวม</strong></td>
                <td><strong>รวมผู้ป่วยทุกเขตพื้นที่</strong></td>
                <td style="text-align: right; font-weight: 700; color: #3b82f6;">${total.toLocaleString()}</td>
                <td style="text-align: right; font-weight: 700; color: #3b82f6;">100.0%</td>
            </tr>
        `;
    }
}

function updateSummaryCards() {
    document.getElementById('totalPatients').textContent = filteredData.length;

    const withComma = filteredData.filter(d => (d.addr || '').includes(',')).length;
    document.getElementById('commaAddrCount').textContent = withComma;

    const highRisk = filteredData.filter(d => String(d.risk_group).toLowerCase().includes('เสี่ยง')).length;
    document.getElementById('highRiskCount').textContent = highRisk;

    if (filteredData.length > 0) {
        const nationCounts = {};
        filteredData.forEach(d => nationCounts[d.nation] = (nationCounts[d.nation] || 0) + 1);
        const top = Object.keys(nationCounts).reduce((a, b) => nationCounts[a] > nationCounts[b] ? a : b);
        document.getElementById('topNation').textContent = top;
    } else {
        document.getElementById('topNation').textContent = '-';
    }
}

function updateTable() {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>';
        return;
    }

    filteredData.slice(0, 100).forEach(d => { 
        const tr = document.createElement('tr');
        
        let riskClass = 'low';
        if(String(d.risk_group).toLowerCase().includes('เสี่ยง')) riskClass = 'high';
        else if(d.risk_group === 'Medium') riskClass = 'medium';

        const nameTag = d.name ? `<div style="font-size:0.85em; opacity:0.75; font-weight:400;">${d.name}</div>` : '';

        tr.innerHTML = `
            <td><strong>${d.id}</strong>${nameTag}</td>
            <td>${d.date}</td>
            <td>${d.addr}</td>
            <td>${d.opd}</td>
            <td>${d.nation}</td>
            <td><span class="badge ${riskClass}">${d.risk_group}</span></td>
            <td>${d.risk_type}</td>
        `;
        tbody.appendChild(tr);
    });
}

function getCounts(key) {
    const counts = {};
    filteredData.forEach(d => counts[d[key]] = (counts[d[key]] || 0) + 1);
    return counts;
}

function createOrUpdateChart(chartId, type, data, options) {
    if (typeof Chart === 'undefined') {
        console.error("Chart.js is not loaded.");
        return;
    }
    
    // ตั้งค่าสีเริ่มต้นให้เข้ากับ Dark Mode ตอนสร้างกราฟครั้งแรก
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';

    const canvas = document.getElementById(chartId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (charts[chartId]) {
        charts[chartId].destroy();
    }
    charts[chartId] = new Chart(ctx, { type, data, options });
}

function updateCharts() {
    // 1. OPD / IPD Chart
    const opdCounts = getCounts('opd');
    const sortedKeys = Object.keys(opdCounts).sort((a, b) => opdCounts[b] - opdCounts[a]);
    const bgColors = sortedKeys.map(key => {
        if (key.startsWith('IPD')) return '#f59e0b'; // Amber/Orange for IPD
        if (key.startsWith('OPD')) return '#10b981'; // Emerald/Green for OPD
        return '#64748b'; // Slate for ไม่ระบุ OPD
    });

    createOrUpdateChart('opdChart', 'bar', {
        labels: sortedKeys,
        datasets: [{
            label: 'Patients',
            data: sortedKeys.map(k => opdCounts[k]),
            backgroundColor: bgColors,
            borderRadius: 6
        }]
    }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } });

    // 3. Nationality Chart
    const nationCounts = getCounts('nation');
    const totalNations = Object.values(nationCounts).reduce((a, b) => a + b, 0);
    const sortedNationKeys = Object.keys(nationCounts).sort((a, b) => nationCounts[b] - nationCounts[a]);
    
    const nationLabels = sortedNationKeys.map(k => {
        const count = nationCounts[k];
        const pct = totalNations > 0 ? ((count / totalNations) * 100).toFixed(1) : 0;
        return `${k}: ${count.toLocaleString()} คน (${pct}%)`;
    });

    createOrUpdateChart('nationChart', 'pie', {
        labels: nationLabels,
        datasets: [{
            data: sortedNationKeys.map(k => nationCounts[k]),
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'],
            borderWidth: 0
        }]
    }, { 
        responsive: true, 
        maintainAspectRatio: false, 
        plugins: { 
            legend: { 
                position: 'bottom',
                labels: {
                    padding: 16,
                    font: { size: 13, weight: '500' }
                }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const count = context.raw || 0;
                        const pct = totalNations > 0 ? ((count / totalNations) * 100).toFixed(1) : 0;
                        return ` จำนวน: ${count.toLocaleString()} คน (${pct}%)`;
                    }
                }
            }
        } 
    });

    // 4. Risk Group & Type
    const riskGroups = [...new Set(rawData.map(d => d.risk_group))];
    const riskTypes = [...new Set(rawData.map(d => d.risk_type))];
    
    const datasets = riskTypes.map((type, i) => {
        const colors = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#64748b'];
        return {
            label: type,
            data: riskGroups.map(group => 
                filteredData.filter(d => d.risk_group === group && d.risk_type === type).length
            ),
            backgroundColor: colors[i % colors.length]
        };
    });

    createOrUpdateChart('riskChart', 'bar', {
        labels: riskGroups,
        datasets: datasets
    }, { 
        responsive: true, 
        maintainAspectRatio: false,
        scales: {
            x: { stacked: true },
            y: { stacked: true }
        }
    });
}

// ==========================================
// EXCEL IMPORT & GOOGLE SHEET SYNC LOGIC
// ==========================================
function setupExcelImport() {
    const inputHeader = document.getElementById('excelFileInputHeader');
    const inputSidebar = document.getElementById('excelFileInputSidebar');
    const modal = document.getElementById('importModal');
    const closeBtn = document.getElementById('closeImportModal');
    const confirmBtn = document.getElementById('confirmImportModal');

    // Settings Modal Elements
    const btnSettingsHeader = document.getElementById('btnOpenSheetSettingsHeader');
    const btnSettingsSidebar = document.getElementById('btnOpenSheetSettingsSidebar');
    const settingsModal = document.getElementById('sheetSettingsModal');
    const closeSettingsBtn = document.getElementById('closeSheetSettingsModal');
    const inputUrl = document.getElementById('inputWebAppUrl');
    const btnSaveUrl = document.getElementById('btnSaveWebAppUrl');
    const btnTestUrl = document.getElementById('btnTestWebAppUrl');
    const statusBox = document.getElementById('connectionStatusBox');

    if (inputHeader) {
        inputHeader.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleExcelFile(e.target.files[0]);
                e.target.value = '';
            }
        });
    }

    if (inputSidebar) {
        inputSidebar.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleExcelFile(e.target.files[0]);
                e.target.value = '';
            }
        });
    }

    const closeModal = () => {
        if (modal) modal.style.display = 'none';
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (confirmBtn) confirmBtn.addEventListener('click', closeModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // Settings Modal Handlers
    const openSettings = () => {
        if (inputUrl) inputUrl.value = GOOGLE_SCRIPT_WEBAPP_URL || '';
        if (statusBox) {
            if (GOOGLE_SCRIPT_WEBAPP_URL) {
                statusBox.style.display = 'block';
                statusBox.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
                statusBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
                statusBox.style.color = '#34d399';
                statusBox.innerHTML = '🟢 มีการเชื่อมต่อ Web App URL แล้ว (ข้อมูลใหม่จะถูกบันทึกลง Google Sheet อัตโนมัติ)';
            } else {
                statusBox.style.display = 'none';
            }
        }
        if (settingsModal) settingsModal.style.display = 'flex';
    };

    const closeSettings = () => {
        if (settingsModal) settingsModal.style.display = 'none';
    };

    if (btnSettingsHeader) btnSettingsHeader.addEventListener('click', openSettings);
    if (btnSettingsSidebar) btnSettingsSidebar.addEventListener('click', openSettings);
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) closeSettings();
        });
    }

    // Save Web App URL
    if (btnSaveUrl) {
        btnSaveUrl.addEventListener('click', () => {
            const val = inputUrl ? inputUrl.value.trim() : '';
            GOOGLE_SCRIPT_WEBAPP_URL = val;
            if (val) {
                localStorage.setItem('clinic_google_webapp_url', val);
            } else {
                localStorage.removeItem('clinic_google_webapp_url');
            }
            if (statusBox) {
                statusBox.style.display = 'block';
                statusBox.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
                statusBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
                statusBox.style.color = '#34d399';
                statusBox.innerHTML = '✅ บันทึกการตั้งค่าเรียบร้อยแล้ว!';
            }
            setTimeout(closeSettings, 1000);
        });
    }

    // Test Web App URL Connection
    if (btnTestUrl) {
        btnTestUrl.addEventListener('click', async () => {
            const val = inputUrl ? inputUrl.value.trim() : '';
            if (!val) {
                alert("กรุณากรอก URL เว็บแอปก่อนทำการทดสอบ");
                return;
            }
            if (statusBox) {
                statusBox.style.display = 'block';
                statusBox.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
                statusBox.style.border = '1px solid rgba(59, 130, 246, 0.4)';
                statusBox.style.color = '#60a5fa';
                statusBox.innerHTML = '⏳ กำลังทดสอบการเชื่อมต่อกับ Google Apps Script...';
            }

            try {
                // Ping Web App with a simple GET
                await fetch(val + (val.includes('?') ? '&' : '?') + 'ping=1', { mode: 'no-cors' });
                if (statusBox) {
                    statusBox.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
                    statusBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
                    statusBox.style.color = '#34d399';
                    statusBox.innerHTML = '🟢 เชื่อมต่อกับ Google Apps Script สำเร็จ พร้อมใช้งาน!';
                }
            } catch (err) {
                if (statusBox) {
                    statusBox.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                    statusBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
                    statusBox.style.color = '#f87171';
                    statusBox.innerHTML = '❌ ไม่สามารถเชื่อมต่อได้: ' + err.message;
                }
            }
        });
    }
}

async function handleExcelFile(file) {
    if (typeof XLSX === 'undefined') {
        alert("ระบบอ่านไฟล์ Excel (SheetJS) กำลังโหลด กรุณารอสักครู่แล้วลองใหม่อีกครั้ง");
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            
            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                alert("ไฟล์ Excel ไม่มีแผ่นงาน (Sheet)");
                return;
            }

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

            if (!rows || rows.length === 0) {
                alert("ไม่พบข้อมูลในไฟล์ Excel ที่เลือก");
                return;
            }

            // รวบรวม existing identifiers เพื่อตรวจสอบความซ้ำ
            const existingIds = new Set(rawData.map(d => String(d.id || '').trim().toLowerCase()));
            const existingCids = new Set(rawData.filter(d => d.cid).map(d => String(d.cid || '').trim().toLowerCase()));

            const getField = (row, aliases) => {
                for (let alias of aliases) {
                    for (let key in row) {
                        if (key.trim().toLowerCase() === alias.trim().toLowerCase()) {
                            let val = row[key];
                            if (val !== null && val !== undefined && String(val).trim() !== '') {
                                return String(val).trim();
                            }
                        }
                    }
                }
                return '';
            };

            let addedCount = 0;
            let duplicateCount = 0;
            const newRecords = [];
            const newRawExcelRows = [];
            const newFileIds = new Set();

            rows.forEach((row, idx) => {
                let hn = getField(row, ['DT07_HN', 'HN', 'ID', 'PID', 'DT07_NHSO_ID', 'No']);
                let cid = getField(row, ['CID', 'DT07_CID', 'CIDREAL']);

                if (!hn && !cid) {
                    return; // ข้ามแถวที่ไม่มีทั้ง HN และ CID
                }

                let idKey = (hn || cid).toLowerCase();
                let cidKey = cid ? cid.toLowerCase() : '';

                // ตรวจสอบความซ้ำกับข้อมูลเดิมในระบบ หรือซ้ำภายในไฟล์เดียวกัน
                let isDuplicate = existingIds.has(idKey) || (cidKey && existingCids.has(cidKey)) || newFileIds.has(idKey);

                if (isDuplicate) {
                    duplicateCount++;
                    return; // ข้ามข้อมูลที่ซ้ำกันอัตโนมัติ
                }

                // บันทึก ID ที่นำเข้าเพื่อไม่ให้ซ้ำกับแถวถัดไปในไฟล์
                newFileIds.add(idKey);
                if (cidKey) newFileIds.add(cidKey);

                let name = getField(row, ['PNAME', 'NAME', 'ชื่อ-นามสกุล', 'ชื่อ']);
                let date = getField(row, ['START_DATE', 'DT07_START_DATE', 'DATE_REGIS', 'DT07_DATE_REGIS', 'Date', 'วันที่']);
                if (date.length === 8 && /^\d{8}$/.test(date)) {
                    date = `${date.substring(0,4)}-${date.substring(4,6)}-${date.substring(6,8)}`;
                }

                let addr = getField(row, ['ADDR', 'Address', 'ที่อยู่']);
                let mu = getField(row, ['MU', 'หมู่']);
                let tam = getField(row, ['TAMBON_PATIENT', 'PTAMBON_NAME', 'ตำบล']);
                let ampRaw = (getField(row, ['AMPUR_PATIENT', 'PAMPUR_NAME', 'AMPUR_NAME', 'อำเภอ'])).trim();
                let prov = getField(row, ['CHANGWAT_PATIENT', 'PCHANGWAT_NAME', 'DT07_CHANGWAT', 'จังหวัด']);

                let addrParts = [];
                if (addr) addrParts.push(addr);
                if (mu) addrParts.push('ม.' + mu);
                if (tam) addrParts.push('ต.' + tam);
                if (ampRaw) addrParts.push('อ.' + ampRaw);
                if (prov) addrParts.push('จ.' + prov);

                let fullAddr = addrParts.length > 0 ? addrParts.join(' ') : (addr || '-');
                let opd = extractOpdFromAddr(addr) || getField(row, ['HOSP_NAME', 'DT07_HOSP_NAME', 'OPD']) || 'ไม่ระบุ OPD';
                let nation = getField(row, ['NATION', 'DT07_PEOPLE_TYPE', 'PEOPLE_TYPE', 'สัญชาติ']) || 'ไทย';
                let risk_group = getField(row, ['RISK_GROUP', 'Risk Group', 'กลุ่มเสี่ยง']) || '-';
                let risk_type = getField(row, ['RISK_TYPE', 'Risk Type', 'ประเภทความเสี่ยง']) || '-';

                let ampArea = (ampRaw === 'เมืองเชียงราย' || ampRaw.includes('เมืองเชียงราย')) ? 'ในเขตอำเภอเมืองเชียงราย' : 'นอกเขต';

                newRecords.push({
                    id: hn || cid || `PT-IMP-${1000 + idx}`,
                    cid: cid,
                    name: name,
                    date: date || '-',
                    addr: fullAddr,
                    rawAddr: addr,
                    opd: opd,
                    amp: ampArea,
                    ampRaw: ampRaw,
                    nation: nation,
                    risk_group: risk_group,
                    risk_type: risk_type
                });

                newRawExcelRows.push(row);
                addedCount++;
            });

            // อัปเดตเข้าระบบแดชบอร์ดทันที
            if (newRecords.length > 0) {
                rawData = [...newRecords, ...rawData];
                filteredData = [...rawData];
                initFilters();
                updateDashboard();
            }

            // จัดการเรื่องการ Sync บันทึกย้อนกลับลง Google Sheet
            if (addedCount > 0 && GOOGLE_SCRIPT_WEBAPP_URL) {
                showImportResultModal(file.name, rows.length, addedCount, duplicateCount, rawData.length, 'syncing');
                try {
                    await syncToGoogleSheet(newRawExcelRows);
                    showImportResultModal(file.name, rows.length, addedCount, duplicateCount, rawData.length, 'success');
                } catch (syncErr) {
                    console.error("Google Sheet Sync Error:", syncErr);
                    showImportResultModal(file.name, rows.length, addedCount, duplicateCount, rawData.length, 'error');
                }
            } else if (addedCount > 0 && !GOOGLE_SCRIPT_WEBAPP_URL) {
                showImportResultModal(file.name, rows.length, addedCount, duplicateCount, rawData.length, 'no_url');
            } else {
                showImportResultModal(file.name, rows.length, addedCount, duplicateCount, rawData.length, 'none');
            }

        } catch (err) {
            console.error("Excel Import Error:", err);
            alert("เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// ฟังก์ชันส่งข้อมูลเข้า Google Apps Script เพื่อเขียนลง Google Sheet
async function syncToGoogleSheet(rows) {
    if (!GOOGLE_SCRIPT_WEBAPP_URL) return;
    const response = await fetch(GOOGLE_SCRIPT_WEBAPP_URL, {
        method: 'POST',
        mode: 'no-cors', // ทำงานได้กับ Apps Script โดยไม่ติดบล็อก CORS
        headers: {
            'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({ rows: rows })
    });
    return response;
}

function showImportResultModal(fileName, totalRows, addedCount, duplicateCount, totalInSystem, syncStatus = 'none') {
    const modal = document.getElementById('importModal');
    const content = document.getElementById('importModalContent');
    const statusSidebar = document.getElementById('importStatusSidebar');

    if (statusSidebar) {
        statusSidebar.textContent = `นำเข้าล่าสุด: +${addedCount} รายการ`;
    }

    if (!modal || !content) {
        alert(`นำเข้าข้อมูลจาก ${fileName} สำเร็จ!\n- ข้อมูลใหม่ที่เพิ่ม: ${addedCount} รายการ\n- ข้อมูลที่ซ้ำ: ${duplicateCount} รายการ\n- ยอดรวมผู้ป่วยในระบบ: ${totalInSystem} รายการ`);
        return;
    }

    let syncBannerHtml = '';
    if (syncStatus === 'syncing') {
        syncBannerHtml = `
            <div class="sync-banner syncing">
                ⏳ <strong>กำลังบันทึกข้อมูล ${addedCount.toLocaleString()} รายการลงใน Google Sheet...</strong>
            </div>
        `;
    } else if (syncStatus === 'success') {
        syncBannerHtml = `
            <div class="sync-banner success">
                ✅ <strong>บันทึกข้อมูลเข้า Google Sheet เรียบร้อยแล้ว!</strong><br>
                <span style="font-size: 12px; color: #a7f3d0;">แถวใหม่ถูกเขียนลงใน Google Sheet อัตโนมัติแล้ว</span>
            </div>
        `;
    } else if (syncStatus === 'no_url') {
        syncBannerHtml = `
            <div class="sync-banner warning">
                <strong>⚠️ ยังไม่ได้บันทึกลงใน Google Sheet จริง</strong><br>
                <span style="font-size: 12.5px; color: #fde68a;">ข้อมูลแสดงผลบนแดชบอร์ดชั่วคราวแล้ว แต่หากต้องการให้บันทึกลง Google Sheet ถาวรแบบอัตโนมัติ กรุณาเชื่อมต่อ Web App</span>
                <br>
                <button id="modalBtnConfigureSheet" class="btn-configure-sheet">
                    ⚙️ ตั้งค่าเชื่อมต่อ Google Sheet
                </button>
            </div>
        `;
    } else if (syncStatus === 'error') {
        syncBannerHtml = `
            <div class="sync-banner error">
                ❌ <strong>เกิดข้อผิดพลาดในการบันทึกลง Google Sheet</strong><br>
                <span style="font-size: 12px; color: #fecaca;">กรุณาตรวจสอบ URL เว็บแอป หรือสิทธิ์การเข้าถึง (Who has access: Anyone)</span>
            </div>
        `;
    }

    content.innerHTML = `
        <p style="margin-bottom: 8px;"><strong>ชื่อไฟล์:</strong> <span style="color: var(--text-muted);">${fileName}</span></p>
        <p style="margin-bottom: 16px;"><strong>ข้อมูลที่ตรวจพบทั้งหมด:</strong> ${totalRows.toLocaleString()} แถว</p>
        
        <div class="modal-stat-box">
            <div class="stat-item success">
                <span style="font-size: 13px; color: var(--text-muted);">นำเข้าสำเร็จ (ใหม่)</span>
                <div class="num">+${addedCount.toLocaleString()}</div>
            </div>
            <div class="stat-item warning">
                <span style="font-size: 13px; color: var(--text-muted);">ข้อมูลซ้ำเดิม (ข้าม)</span>
                <div class="num">${duplicateCount.toLocaleString()}</div>
            </div>
        </div>

        <div style="background-color: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px; margin-top: 12px;">
            <span style="font-size: 13px; color: var(--primary);">🏥 <strong>ยอดรวมผู้ป่วยในระบบล่าสุด:</strong> ${totalInSystem.toLocaleString()} ราย</span>
        </div>

        ${syncBannerHtml}
    `;

    // Hook up configuration button inside modal if present
    const btnConfig = document.getElementById('modalBtnConfigureSheet');
    if (btnConfig) {
        btnConfig.addEventListener('click', () => {
            modal.style.display = 'none';
            const settingsBtn = document.getElementById('btnOpenSheetSettingsHeader');
            if (settingsBtn) settingsBtn.click();
        });
    }

    modal.style.display = 'flex';
}
