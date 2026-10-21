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
const SHEET_ID = '1QuI0g0i-91l8KxsBO-3a7Q_1pg6rnq7EMR8qIC7XwTQ';
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

// Utility function to format dates to YYYY-MM-DD
function formatDateValue(val) {
    if (!val && val !== 0) return '';
    val = String(val).trim();
    // Google Visualization Date(yyyy, m, d)
    let gMatch = val.match(/Date\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (gMatch) {
        let y = gMatch[1];
        let m = String(parseInt(gMatch[2], 10) + 1).padStart(2, '0');
        let d = String(parseInt(gMatch[3], 10)).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    // 8 digits: YYYYMMDD e.g. 20251001
    if (/^\d{8}$/.test(val)) {
        return `${val.substring(0,4)}-${val.substring(4,6)}-${val.substring(6,8)}`;
    }
    // YYYY-MM-DD or YYYY/MM/DD
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(val)) {
        let parts = val.split(/[-/]/);
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].substring(0,2).padStart(2, '0')}`;
    }
    // DD/MM/YYYY or DD-MM-YYYY
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(val)) {
        let parts = val.split(/[-/]/);
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return val;
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
            let val = (cell.f !== undefined && cell.f !== null) ? String(cell.f).trim() : String(cell.v).trim();
            // Format date columns to YYYY-MM-DD
            if (colName.toLowerCase().includes('date') || colName.toLowerCase().includes('regis')) {
                val = formatDateValue(val);
            }
            return val;
        };

        rawData = rows.map((row, index) => {
            let hn = getVal(row, 'DT07_HN') || getVal(row, 'HN') || getVal(row, 'DT07_NHSO_ID') || getVal(row, 'No') || getVal(row, 'ID') || `PT-${1000 + index + 1}`;
            let name = getVal(row, 'PNAME') || '';
            // กรองข้อมูลรายงานทุกตัวจาก DATE_REGIS
            let date = getVal(row, 'DATE_REGIS') || getVal(row, 'DT07_DATE_REGIS') || getVal(row, 'DT07_START_DATE') || getVal(row, 'START_DATE') || getVal(row, 'Date') || '-';
            
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

            let rx_result = getVal(row, 'RX_RESULT') || '-';
            let b24_result = getVal(row, 'B24_RESULT') || '-';
            let summary = getVal(row, 'SUMMARY') || '-';
            let regis_type = getVal(row, 'REGIS_TYPE') || '-';
            let classify = getVal(row, 'CLASSIFY') || '-';
            let occ_name_th = getVal(row, 'OCC_NAME_TH') || getVal(row, 'OCC_NAME') || getVal(row, 'OCCUPATION') || '-';
            let group_age_y = getVal(row, 'GROUP_AGE_Y') || getVal(row, 'GROUP_AGE') || getVal(row, 'AGE_GROUP') || getVal(row, 'AGE_Y') || '-';

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
                risk_type: risk_type,
                rx_result: rx_result,
                b24_result: b24_result,
                summary: summary,
                regis_type: regis_type,
                classify: classify,
                occ_name_th: occ_name_th,
                group_age_y: group_age_y
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

        const btnApply = document.getElementById('applyFilters');
        if (btnApply) btnApply.addEventListener('click', applyFilters);

        const btnReset = document.getElementById('resetFilters');
        if (btnReset) btnReset.addEventListener('click', resetFilters);

        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.addEventListener('input', applySearch);

        const dateStart = document.getElementById('dateStart');
        const dateEnd = document.getElementById('dateEnd');
        if (dateStart) dateStart.addEventListener('keyup', (e) => { if (e.key === 'Enter') applyFilters(); });
        if (dateEnd) dateEnd.addEventListener('keyup', (e) => { if (e.key === 'Enter') applyFilters(); });

        // Helper: wire up chart/table toggle for any card
        function setupToggle(chartBtnId, tableBtnId, chartContId, tableContId, redrawFn) {
            const btnC = document.getElementById(chartBtnId);
            const btnT = document.getElementById(tableBtnId);
            const contC = document.getElementById(chartContId);
            const contT = document.getElementById(tableContId);
            if (!btnC || !btnT) return;
            btnC.addEventListener('click', () => {
                btnC.classList.add('active'); btnT.classList.remove('active');
                if (contC) contC.style.display = 'block';
                if (contT) contT.style.display = 'none';
                if (redrawFn) redrawFn();
            });
            btnT.addEventListener('click', () => {
                btnT.classList.add('active'); btnC.classList.remove('active');
                if (contC) contC.style.display = 'none';
                if (contT) contT.style.display = 'block';
            });
        }

        setupToggle('btnShowOpdChart', 'btnShowOpdTable', 'opdSummaryChartContainer', 'opdSummaryTableContainer', updateOpdSummaryChart);
        setupToggle('btnShowOpdDetailChart', 'btnShowOpdDetailTable', 'opdDetailChartContainer', 'opdDetailTableContainer', updateOpdDetailChart);
        setupToggle('btnShowNationChart', 'btnShowNationTable', 'nationChartContainer', 'nationTableContainer', () => updateCharts());
        setupToggle('btnShowRiskGroupChart', 'btnShowRiskGroupTable', 'riskGroupChartContainer', 'riskGroupTableContainer', updateRiskGroupChart);
        setupToggle('btnShowRiskTypeChart', 'btnShowRiskTypeTable', 'riskTypeChartContainer', 'riskTypeTableContainer', updateRiskTypeChart);
        setupToggle('btnShowAmpurChart', 'btnShowAmpurTable', 'ampurChartContainer', 'ampurTableContainer', updateAmpurChart);
        setupToggle('btnShowRxChart', 'btnShowRxTable', 'rxResultChartContainer', 'rxResultTableContainer', () => updateCharts());
        setupToggle('btnShowB24Chart', 'btnShowB24Table', 'b24ResultChartContainer', 'b24ResultTableContainer', () => updateCharts());
        setupToggle('btnShowSummaryChart', 'btnShowSummaryTable', 'summaryChartContainer', 'summaryTableContainer', () => updateCharts());
        setupToggle('btnShowRegisChart', 'btnShowRegisTable', 'regisTypeChartContainer', 'regisTypeTableContainer', () => updateCharts());
        setupToggle('btnShowClassifyChart', 'btnShowClassifyTable', 'classifyChartContainer', 'classifyTableContainer', () => updateCharts());
        setupToggle('btnShowOccChart', 'btnShowOccTable', 'occNameChartContainer', 'occNameTableContainer', () => updateCharts());
        setupToggle('btnShowGroupAgeChart', 'btnShowGroupAgeTable', 'groupAgeChartContainer', 'groupAgeTableContainer', updateGroupAgeChart);
    } catch (err) {
        showError("เกิดข้อผิดพลาดในการเตรียมแดชบอร์ด (initializeDashboard): " + err.message);
    }
}

let inlineFlatpickrInstance = null;
let startFlatpickrInstance = null;
let endFlatpickrInstance = null;

function initFilters() {
    const opds = [...new Set(rawData.map(d => d.opd))];
    const nations = [...new Set(rawData.map(d => d.nation))];
    const riskGroups = [...new Set(rawData.map(d => d.risk_group))];

    populateSelect('opdFilter', opds);
    populateSelect('nationFilter', nations);
    populateSelect('riskGroupFilter', riskGroups);

    // กำหนดช่วงวันที่เริ่มต้นและสิ้นสุดของ DATE_REGIS ที่พบในระบบ
    const validDates = rawData
        .map(d => d.date)
        .filter(dt => dt && dt !== '-' && /^\d{4}-\d{2}-\d{2}$/.test(dt))
        .sort();

    const minDate = validDates.length > 0 ? validDates[0] : '';
    const maxDate = validDates.length > 0 ? validDates[validDates.length - 1] : '';

    const infoEl = document.getElementById('dateFilterInfo');
    if (infoEl && minDate && maxDate) {
        infoEl.innerHTML = `📅 ช่วงข้อมูล DATE_REGIS ในระบบ: <br><strong>${minDate}</strong> ถึง <strong>${maxDate}</strong>`;
    }

    // เริ่มต้นระบบปฏิทิน (Inline Calendar & Pop-up Datepickers)
    initCalendarFilter(minDate, maxDate);
}

function initCalendarFilter(minDate, maxDate) {
    const calendarInlineEl = document.getElementById('calendarInline');
    const dateStartEl = document.getElementById('dateStart');
    const dateEndEl = document.getElementById('dateEnd');
    const wrapperEl = document.getElementById('calendarInlineWrapper');
    const btnToggle = document.getElementById('btnToggleCalendarView');
    const toggleText = document.getElementById('toggleCalendarText');
    const toggleIcon = document.getElementById('toggleCalendarIcon');

    // ปุ่มสลับแสดง / ย่อปฏิทิน
    if (btnToggle && wrapperEl) {
        btnToggle.addEventListener('click', () => {
            const isHidden = wrapperEl.classList.toggle('collapsed');
            if (toggleText) toggleText.textContent = isHidden ? 'แสดงปฏิทิน' : 'ย่อปฏิทิน';
            if (toggleIcon) toggleIcon.textContent = isHidden ? '📅' : '📆';
        });
    }

    // ปุ่มลัดเลือกช่วงเวลา (Quick Presets)
    const presetChips = document.querySelectorAll('.preset-chip');
    presetChips.forEach(chip => {
        chip.addEventListener('click', () => {
            presetChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const preset = chip.getAttribute('data-preset');
            applyDatePreset(preset, minDate, maxDate);
        });
    });

    const thaiLocale = {
        firstDayOfWeek: 0,
        weekdays: {
            shorthand: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"],
            longhand: ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"]
        },
        months: {
            shorthand: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."],
            longhand: ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
        },
        rangeSeparator: " ถึง "
    };

    if (typeof flatpickr !== 'undefined') {
        try {
            // 1. ปฏิทินแสดงบนหน้าจอ (Visual Inline Calendar)
            if (calendarInlineEl) {
                inlineFlatpickrInstance = flatpickr(calendarInlineEl, {
                    inline: true,
                    mode: "range",
                    dateFormat: "Y-m-d",
                    minDate: minDate || undefined,
                    maxDate: maxDate || undefined,
                    defaultDate: [minDate || "2025-10-01", maxDate || "2026-10-17"],
                    locale: thaiLocale,
                    onChange: function(selectedDates, dateStr, instance) {
                        presetChips.forEach(c => c.classList.remove('active'));

                        if (selectedDates.length === 2) {
                            const d1 = instance.formatDate(selectedDates[0], "Y-m-d");
                            const d2 = instance.formatDate(selectedDates[1], "Y-m-d");
                            if (dateStartEl) dateStartEl.value = d1;
                            if (dateEndEl) dateEndEl.value = d2;
                            if (startFlatpickrInstance) startFlatpickrInstance.setDate(d1, false);
                            if (endFlatpickrInstance) endFlatpickrInstance.setDate(d2, false);
                        } else if (selectedDates.length === 1) {
                            const d1 = instance.formatDate(selectedDates[0], "Y-m-d");
                            if (dateStartEl) dateStartEl.value = d1;
                            if (dateEndEl) dateEndEl.value = '';
                            if (startFlatpickrInstance) startFlatpickrInstance.setDate(d1, false);
                        }
                    }
                });
            }

            // 2. ปฏิทินแบบ Pop-up เมื่อคลิกช่อง "ตั้งแต่วันที่"
            if (dateStartEl) {
                startFlatpickrInstance = flatpickr(dateStartEl, {
                    dateFormat: "Y-m-d",
                    minDate: minDate || undefined,
                    maxDate: maxDate || undefined,
                    defaultDate: minDate || "2025-10-01",
                    locale: thaiLocale,
                    onChange: function(selectedDates, dateStr) {
                        presetChips.forEach(c => c.classList.remove('active'));
                        if (inlineFlatpickrInstance && dateStr) {
                            const currentEnd = dateEndEl ? dateEndEl.value : '';
                            if (currentEnd) {
                                inlineFlatpickrInstance.setDate([dateStr, currentEnd], false);
                            } else {
                                inlineFlatpickrInstance.setDate([dateStr], false);
                            }
                        }
                    }
                });
            }

            // 3. ปฏิทินแบบ Pop-up เมื่อคลิกช่อง "ถึงวันที่"
            if (dateEndEl) {
                endFlatpickrInstance = flatpickr(dateEndEl, {
                    dateFormat: "Y-m-d",
                    minDate: minDate || undefined,
                    maxDate: maxDate || undefined,
                    defaultDate: maxDate || "2026-10-17",
                    locale: thaiLocale,
                    onChange: function(selectedDates, dateStr) {
                        presetChips.forEach(c => c.classList.remove('active'));
                        if (inlineFlatpickrInstance && dateStr) {
                            const currentStart = dateStartEl ? dateStartEl.value : '';
                            if (currentStart) {
                                inlineFlatpickrInstance.setDate([currentStart, dateStr], false);
                            }
                        }
                    }
                });
            }

            // กำหนดค่าเริ่มต้น
            if (dateStartEl) dateStartEl.value = minDate || '2025-10-01';
            if (dateEndEl) dateEndEl.value = maxDate || '2026-10-17';
            if (inlineFlatpickrInstance) {
                inlineFlatpickrInstance.setDate([minDate || '2025-10-01', maxDate || '2026-10-17'], false);
            }
        } catch (err) {
            console.error("Flatpickr Error:", err);
            initFallbackCalendar(minDate, maxDate);
        }
    } else {
        initFallbackCalendar(minDate, maxDate);
    }
}

function applyDatePreset(preset, minDate, maxDate) {
    const dateStartEl = document.getElementById('dateStart');
    const dateEndEl = document.getElementById('dateEnd');
    let start = '';
    let end = '';

    if (preset === 'all') {
        start = minDate || '2025-10-01';
        end = maxDate || '2026-10-17';
    } else if (preset === 'oct25') {
        start = '2025-10-01';
        end = '2025-10-31';
    } else if (preset === 'month') {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
        start = `${y}-${m}-01`;
        end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    } else if (preset === 'days30') {
        const endDt = maxDate ? new Date(maxDate) : new Date();
        const startDt = new Date(endDt.getTime() - (29 * 24 * 60 * 60 * 1000));
        start = startDt.toISOString().split('T')[0];
        end = endDt.toISOString().split('T')[0];
    }

    if (dateStartEl) dateStartEl.value = start;
    if (dateEndEl) dateEndEl.value = end;

    if (inlineFlatpickrInstance && start && end) {
        inlineFlatpickrInstance.setDate([start, end], false);
        inlineFlatpickrInstance.jumpToDate(start);
    }
    if (startFlatpickrInstance && start) startFlatpickrInstance.setDate(start, false);
    if (endFlatpickrInstance && end) endFlatpickrInstance.setDate(end, false);
}

function initFallbackCalendar(minDate, maxDate) {
    const dateStartEl = document.getElementById('dateStart');
    const dateEndEl = document.getElementById('dateEnd');
    if (dateStartEl) {
        dateStartEl.type = 'date';
        dateStartEl.value = minDate || '2025-10-01';
        dateStartEl.addEventListener('click', function() { if (this.showPicker) this.showPicker(); });
    }
    if (dateEndEl) {
        dateEndEl.type = 'date';
        dateEndEl.value = maxDate || '2026-10-17';
        dateEndEl.addEventListener('click', function() { if (this.showPicker) this.showPicker(); });
    }
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
    const start = document.getElementById('dateStart') ? document.getElementById('dateStart').value : '';
    const end = document.getElementById('dateEnd') ? document.getElementById('dateEnd').value : '';
    const opd = document.getElementById('opdFilter') ? document.getElementById('opdFilter').value : 'all';
    const nation = document.getElementById('nationFilter') ? document.getElementById('nationFilter').value : 'all';
    const risk = document.getElementById('riskGroupFilter') ? document.getElementById('riskGroupFilter').value : 'all';

    // กรองข้อมูลรายงานทุกตัวจาก DATE_REGIS (d.date)
    filteredData = rawData.filter(d => {
        let match = true;
        if (start && (!d.date || d.date === '-' || d.date < start)) match = false;
        if (end && (!d.date || d.date === '-' || d.date > end)) match = false;
        if (opd !== 'all' && d.opd !== opd) match = false;
        if (nation !== 'all' && d.nation !== nation) match = false;
        if (risk !== 'all' && d.risk_group !== risk) match = false;
        return match;
    });

    // แสดงสถานะการประมวลผลรายงาน
    const statusBadge = document.getElementById('filterResultBadge');
    if (statusBadge) {
        if (start || end || opd !== 'all' || nation !== 'all' || risk !== 'all') {
            statusBadge.style.display = 'flex';
            let dateText = '';
            if (start && end) dateText = `ช่วงวันที่: <strong>${start}</strong> ถึง <strong>${end}</strong>`;
            else if (start) dateText = `ตั้งแต่วันที่: <strong>${start}</strong> เป็นต้นไป`;
            else if (end) dateText = `ถึงวันที่: <strong>${end}</strong>`;
            
            statusBadge.innerHTML = `
                <div>
                    <strong>📊 ผลการประมวลรายงาน:</strong> กรองข้อมูลจาก <code>DATE_REGIS</code> พบ <strong>${filteredData.length.toLocaleString()}</strong> คน (จากทั้งหมด ${rawData.length.toLocaleString()} คน) ${dateText ? ` | ${dateText}` : ''}
                </div>
                <button id="btnClearFilterBadge" style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25); color: #fff; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">🔄 ล้างตัวกรองทั้งหมด</button>
            `;
            const btnClearBadge = document.getElementById('btnClearFilterBadge');
            if (btnClearBadge) btnClearBadge.addEventListener('click', resetFilters);
        } else {
            statusBadge.style.display = 'none';
        }
    }

    applySearch(); 
}

function resetFilters() {
    const start = document.getElementById('dateStart');
    if (start) start.value = '';
    const end = document.getElementById('dateEnd');
    if (end) end.value = '';
    const opd = document.getElementById('opdFilter');
    if (opd) opd.value = 'all';
    const nation = document.getElementById('nationFilter');
    if (nation) nation.value = 'all';
    const risk = document.getElementById('riskGroupFilter');
    if (risk) risk.value = 'all';
    const search = document.getElementById('searchInput');
    if (search) search.value = '';

    const statusBadge = document.getElementById('filterResultBadge');
    if (statusBadge) {
        statusBadge.style.display = 'none';
    }

    // รีเซ็ตปฏิทินและปุ่มลัด
    const validDates = rawData
        .map(d => d.date)
        .filter(dt => dt && dt !== '-' && /^\d{4}-\d{2}-\d{2}$/.test(dt))
        .sort();
    const minDate = validDates.length > 0 ? validDates[0] : '';
    const maxDate = validDates.length > 0 ? validDates[validDates.length - 1] : '';

    if (inlineFlatpickrInstance && minDate && maxDate) {
        inlineFlatpickrInstance.setDate([minDate, maxDate], false);
        inlineFlatpickrInstance.jumpToDate(minDate);
    }
    if (startFlatpickrInstance && minDate) startFlatpickrInstance.setDate(minDate, false);
    if (endFlatpickrInstance && maxDate) endFlatpickrInstance.setDate(maxDate, false);

    document.querySelectorAll('.preset-chip').forEach(c => {
        if (c.getAttribute('data-preset') === 'all') c.classList.add('active');
        else c.classList.remove('active');
    });

    filteredData = [...rawData];
    updateDashboard();
}

function applySearch() {
    const searchInput = document.getElementById('searchInput');
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';
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
    updateOpdSummaryChart();
    updateOpdSummaryTable();
    updateOpdDetailChart();
    updateOpdDetailTable();
    updateGroupAgeChart();
    updateGroupAgeTable();
    updateRiskGroupChart();
    updateRiskGroupDetailTable();
    updateRiskTypeChart();
    updateRiskTypeDetailTable();
    updateAmpurChart();
    updateAmpurDetailTable();
    updateTable();
    try {
        updateCharts();
        updateCategoryTable('nation', 'nationTableBody', 'nationTableFoot');
        updateCategoryTable('rx_result', 'rxResultTableBody', 'rxResultTableFoot');
        updateCategoryTable('b24_result', 'b24ResultTableBody', 'b24ResultTableFoot');
        updateCategoryTable('summary', 'summaryTableBody', 'summaryTableFoot');
        updateCategoryTable('regis_type', 'regisTypeTableBody', 'regisTypeTableFoot');
        updateCategoryTable('classify', 'classifyTableBody', 'classifyTableFoot');
        updateCategoryTable('occ_name_th', 'occNameTableBody', 'occNameTableFoot');
    } catch (err) {
        console.error("Chart Error:", err);
    }
}

function updateOpdSummaryChart() {
    const canvas = document.getElementById('opdSummaryChart');
    if (!canvas) return;

    const total = filteredData.length;
    let opdCount = 0;
    let ipdCount = 0;
    let unkCount = 0;

    filteredData.forEach(d => {
        if (d.opd.startsWith('OPD')) opdCount++;
        else if (d.opd.startsWith('IPD')) ipdCount++;
        else unkCount++;
    });

    const opdPct = total > 0 ? ((opdCount / total) * 100).toFixed(1) : '0.0';
    const ipdPct = total > 0 ? ((ipdCount / total) * 100).toFixed(1) : '0.0';
    const unkPct = total > 0 ? ((unkCount / total) * 100).toFixed(1) : '0.0';

    const labels = [
        `OPD ผู้ป่วยนอก (${opdPct}%)`,
        `IPD ผู้ป่วยใน (${ipdPct}%)`,
        `ไม่ระบุ OPD/IPD (${unkPct}%)`
    ];

    const data = {
        labels: labels,
        datasets: [{
            label: 'จำนวนผู้ป่วย (คน)',
            data: [opdCount, ipdCount, unkCount],
            backgroundColor: [
                'rgba(16, 185, 129, 0.85)', // Green for OPD
                'rgba(245, 158, 11, 0.85)', // Orange for IPD
                'rgba(100, 116, 139, 0.85)' // Slate for Unknown
            ],
            borderColor: [
                '#10b981',
                '#f59e0b',
                '#64748b'
            ],
            borderWidth: 1.5,
            borderRadius: 8,
            maxBarThickness: 65
        }]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleFont: { size: 13, weight: '600' },
                bodyFont: { size: 12.5 },
                padding: 12,
                borderColor: 'rgba(51, 65, 85, 0.8)',
                borderWidth: 1,
                callbacks: {
                    title: function(items) {
                        const idx = items[0].dataIndex;
                        const fullNames = [
                            'OPD (รวมทุกแผนกผู้ป่วยนอก)',
                            'IPD (รวมทุกแผนกผู้ป่วยใน)',
                            'ไม่ระบุ OPD / IPD (มีเฉพาะบ้านเลขที่/หมู่)'
                        ];
                        return fullNames[idx] || items[0].label;
                    },
                    label: function(context) {
                        const count = context.raw || 0;
                        const pct = total > 0 ? ((count / total) * 100).toFixed(2) : '0.00';
                        return ` จำนวนผู้ป่วย: ${count.toLocaleString()} คน (${pct}%)`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    color: '#e2e8f0',
                    font: { size: 12.5, weight: '600' }
                }
            },
            y: {
                grid: { color: 'rgba(51, 65, 85, 0.35)' },
                ticks: {
                    color: '#94a3b8',
                    font: { size: 11.5 },
                    callback: function(value) { return value.toLocaleString() + ' คน'; }
                }
            }
        }
    };

    createOrUpdateChart('opdSummaryChart', 'doughnut', {
        labels: labels,
        datasets: [{
            data: [opdCount, ipdCount, unkCount],
            backgroundColor: [
                '#10b981', // Emerald for OPD
                '#f59e0b', // Amber for IPD
                '#64748b'  // Slate for Unknown
            ],
            borderWidth: 0,
            hoverOffset: 6
        }]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: {
                    padding: 12,
                    font: { size: 11.5, weight: '500' },
                    color: '#cbd5e1'
                }
            },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleFont: { size: 12.5, weight: '600' },
                bodyFont: { size: 12 },
                padding: 10,
                borderColor: 'rgba(51, 65, 85, 0.8)',
                borderWidth: 1,
                callbacks: {
                    title: function(items) {
                        const idx = items[0].dataIndex;
                        const fullNames = [
                            'OPD (ผู้ป่วยนอก)',
                            'IPD (ผู้ป่วยใน)',
                            'ไม่ระบุ OPD / IPD'
                        ];
                        return fullNames[idx] || items[0].label;
                    },
                    label: function(context) {
                        const count = context.raw || 0;
                        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                        return ` จำนวนผู้ป่วย: ${count.toLocaleString()} คน (${pct}%)`;
                    }
                }
            }
        }
    });
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
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">ไม่พบข้อมูลแผนก OPD/IPD</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const deptCounts = {};
    specificDepts.forEach(d => {
        deptCounts[d.opd] = (deptCounts[d.opd] || 0) + 1;
    });

    const sortedDepts = Object.keys(deptCounts).sort((a, b) => deptCounts[b] - deptCounts[a]);
    const grandTotal = specificDepts.length;

    let html = '';

    sortedDepts.forEach((dept, index) => {
        const count = deptCounts[dept];
        const pct = grandTotal > 0 ? ((count / grandTotal) * 100).toFixed(2) : '0.00';
        const dotClass = dept.startsWith('IPD') ? 'orange' : 'green';

        html += `
            <tr>
                <td style="text-align: center; color: var(--text-muted); font-weight: 500;">${index + 1}</td>
                <td><span class="opd-dot ${dotClass}"></span> <strong>${dept}</strong></td>
                <td style="text-align: right; font-weight: 600;">${count.toLocaleString()}</td>
                <td style="text-align: right; font-weight: 600; color: #10b981;">${pct}%</td>
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
                <td style="text-align: right; font-weight: 700; color: #10b981;">100.0%</td>
            </tr>
        `;
    }
}

function updateRiskGroupDetailTable() {
    const tbody = document.getElementById('riskGroupDetailTableBody');
    const tfoot = document.getElementById('riskGroupDetailTableFoot');
    if (!tbody) return;

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">ไม่พบข้อมูลกลุ่มเสี่ยง</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const counts = {};
    filteredData.forEach(d => {
        const group = d.risk_group || 'ไม่ระบุกลุ่มเสี่ยง';
        counts[group] = (counts[group] || 0) + 1;
    });

    const sortedGroups = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const grandTotal = filteredData.length;

    let html = '';

    sortedGroups.forEach((group, index) => {
        const count = counts[group];
        const pct = grandTotal > 0 ? ((count / grandTotal) * 100).toFixed(2) : '0.00';

        let dotClass = 'grey';
        if (group.includes('เสี่ยง') || group.includes('High')) dotClass = 'orange';
        else if (group.includes('ไม่มี') || group.includes('Low')) dotClass = 'green';

        html += `
            <tr>
                <td style="text-align: center; color: var(--text-muted); font-weight: 500;">${index + 1}</td>
                <td><span class="opd-dot ${dotClass}"></span> <strong>${group}</strong></td>
                <td style="text-align: right; font-weight: 600;">${count.toLocaleString()}</td>
                <td style="text-align: right; font-weight: 600; color: #3b82f6;">${pct}%</td>
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
                <td style="text-align: right; font-weight: 700; color: #3b82f6;">100.0%</td>
            </tr>
        `;
    }
}

function updateRiskTypeDetailTable() {
    const tbody = document.getElementById('riskTypeDetailTableBody');
    const tfoot = document.getElementById('riskTypeDetailTableFoot');
    if (!tbody) return;

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">ไม่พบข้อมูลปัจจัย/ประเภทความเสี่ยง</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const counts = {};
    filteredData.forEach(d => {
        const type = d.risk_type || 'ไม่ระบุประเภทความเสี่ยง';
        counts[type] = (counts[type] || 0) + 1;
    });

    const sortedTypes = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const grandTotal = filteredData.length;

    let html = '';

    sortedTypes.forEach((type, index) => {
        const count = counts[type];
        const pct = grandTotal > 0 ? ((count / grandTotal) * 100).toFixed(2) : '0.00';

        let dotClass = 'purple';
        if (type.includes('ไม่มี')) dotClass = 'green';

        html += `
            <tr>
                <td style="text-align: center; color: var(--text-muted); font-weight: 500;">${index + 1}</td>
                <td><span class="opd-dot ${dotClass}"></span> <strong>${type}</strong></td>
                <td style="text-align: right; font-weight: 600;">${count.toLocaleString()}</td>
                <td style="text-align: right; font-weight: 600; color: #8b5cf6;">${pct}%</td>
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
                <td style="text-align: right; font-weight: 700; color: #8b5cf6;">100.0%</td>
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
    const total = filteredData.length;
    const totalEl = document.getElementById('totalPatients');
    if (totalEl) {
        totalEl.textContent = total.toLocaleString();
    }
}

// Bar chart for OPD Detail
function updateOpdDetailChart() {
    const specificDepts = filteredData.filter(d => d.opd && d.opd !== 'ไม่ระบุ OPD');
    const deptCounts = {};
    specificDepts.forEach(d => { deptCounts[d.opd] = (deptCounts[d.opd] || 0) + 1; });
    const sorted = Object.keys(deptCounts).sort((a,b) => deptCounts[b]-deptCounts[a]).slice(0, 8);
    const total = filteredData.length;
    const colors = sorted.map(k => k.startsWith('IPD') ? 'rgba(245,158,11,0.85)' : 'rgba(16,185,129,0.85)');
    createOrUpdateChart('opdDetailChart', 'bar', {
        labels: sorted.map(k => { const pct = total > 0 ? ((deptCounts[k]/total)*100).toFixed(1) : 0; return `${k} (${pct}%)`; }),
        datasets: [{ label: 'ผู้ป่วย (คน)', data: sorted.map(k => deptCounts[k]), backgroundColor: colors, borderRadius: 6, maxBarThickness: 55 }]
    }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw.toLocaleString()} คน (${total>0?((ctx.raw/total)*100).toFixed(1):0}%)` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#e2e8f0', font: { size: 11 }, maxRotation: 30, minRotation: 0 } }, y: { grid: { color: 'rgba(51,65,85,0.35)' }, ticks: { color: '#94a3b8', callback: v => v.toLocaleString()+' คน' } } } });
}

// Bar chart for Group Age (GROUP_AGE_Y)
function updateGroupAgeChart() {
    const canvas = document.getElementById('groupAgeChart');
    if (!canvas) return;

    const ageOrder = ['L_4', '5_14', '15_24', '25_34', '35_44', '45_54', '55_59', '60_64', '65_M'];
    const ageLabelsMap = {
        'L_4': '< 5 ปี',
        '5_14': '5-14 ปี',
        '15_24': '15-24 ปี',
        '25_34': '25-34 ปี',
        '35_44': '35-44 ปี',
        '45_54': '45-54 ปี',
        '55_59': '55-59 ปี',
        '60_64': '60-64 ปี',
        '65_M': '65 ปีขึ้นไป'
    };

    const counts = {};
    filteredData.forEach(d => {
        let val = (d.group_age_y || '').trim();
        if (!val || val === '-' || val === 'null' || val === 'undefined') val = 'ไม่ระบุ';
        counts[val] = (counts[val] || 0) + 1;
    });

    const total = filteredData.length;
    const sortedKeys = Object.keys(counts).sort((a, b) => {
        let idxA = ageOrder.indexOf(a);
        let idxB = ageOrder.indexOf(b);
        if (idxA === -1 && idxB === -1) return a.localeCompare(b);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });

    const agePalette = [
        '#38bdf8', '#0ea5e9', '#0284c7', '#2563eb', 
        '#4f46e5', '#6366f1', '#7c3aed', '#a855f7', '#ec4899', '#64748b'
    ];

    const labels = sortedKeys.map(k => {
        const displayName = ageLabelsMap[k] || k;
        const pct = total > 0 ? ((counts[k] / total) * 100).toFixed(1) : 0;
        return `${displayName} (${pct}%)`;
    });

    createOrUpdateChart('groupAgeChart', 'bar', {
        labels: labels,
        datasets: [{
            label: 'ผู้ป่วย (คน)',
            data: sortedKeys.map(k => counts[k]),
            backgroundColor: sortedKeys.map((_, i) => agePalette[i % agePalette.length]),
            borderRadius: 6,
            maxBarThickness: 45
        }]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    title: function(items) {
                        const k = sortedKeys[items[0].dataIndex];
                        return (ageLabelsMap[k] || k) + (k !== (ageLabelsMap[k] || k) ? ` [${k}]` : '');
                    },
                    label: function(ctx) {
                        const count = ctx.raw || 0;
                        const pct = total > 0 ? ((count / total) * 100).toFixed(2) : 0;
                        return ` จำนวน: ${count.toLocaleString()} คน (${pct}%)`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#e2e8f0', font: { size: 10.5, weight: '500' }, maxRotation: 35, minRotation: 0 }
            },
            y: {
                grid: { color: 'rgba(51, 65, 85, 0.35)' },
                ticks: { color: '#94a3b8', callback: v => v.toLocaleString() + ' คน' }
            }
        }
    });
}

function updateGroupAgeTable() {
    const tbody = document.getElementById('groupAgeTableBody');
    const tfoot = document.getElementById('groupAgeTableFoot');
    if (!tbody) return;

    const ageOrder = ['L_4', '5_14', '15_24', '25_34', '35_44', '45_54', '55_59', '60_64', '65_M'];
    const ageLabelsMap = {
        'L_4': '< 5 ปี (0 - 4 ปี)',
        '5_14': '5 - 14 ปี',
        '15_24': '15 - 24 ปี',
        '25_34': '25 - 34 ปี',
        '35_44': '35 - 44 ปี',
        '45_54': '45 - 54 ปี',
        '55_59': '55 - 59 ปี',
        '60_64': '60 - 64 ปี',
        '65_M': '65 ปีขึ้นไป'
    };

    const counts = {};
    filteredData.forEach(d => {
        let val = (d.group_age_y || '').trim();
        if (!val || val === '-' || val === 'null' || val === 'undefined') val = 'ไม่ระบุ';
        counts[val] = (counts[val] || 0) + 1;
    });

    const total = filteredData.length;
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">ไม่พบข้อมูล</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    const sortedKeys = Object.keys(counts).sort((a, b) => {
        let idxA = ageOrder.indexOf(a);
        let idxB = ageOrder.indexOf(b);
        if (idxA === -1 && idxB === -1) return a.localeCompare(b);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });

    const agePalette = [
        '#38bdf8', '#0ea5e9', '#0284c7', '#2563eb', 
        '#4f46e5', '#6366f1', '#7c3aed', '#a855f7', '#ec4899', '#64748b'
    ];

    let html = '';
    sortedKeys.forEach((key, idx) => {
        const count = counts[key];
        const pct = total > 0 ? ((count / total) * 100).toFixed(2) : '0.00';
        const displayName = ageLabelsMap[key] || key;
        const color = agePalette[idx % agePalette.length];

        html += `<tr>
            <td style="text-align:center;color:var(--text-muted);font-weight:500;">${idx + 1}</td>
            <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:7px;"></span><strong>${displayName}</strong> <span style="font-size:11px;opacity:0.65;">(${key})</span></td>
            <td style="text-align:right;font-weight:600;">${count.toLocaleString()}</td>
            <td style="text-align:right;font-weight:600;color:${color};">${pct}%</td>
        </tr>`;
    });

    tbody.innerHTML = html;
    if (tfoot) {
        tfoot.innerHTML = `<tr><td style="text-align:center;"><strong>รวม</strong></td><td><strong>รวมทั้งหมด</strong></td><td style="text-align:right;font-weight:700;">${total.toLocaleString()} คน</td><td style="text-align:right;font-weight:700;color:#3b82f6;">100.0%</td></tr>`;
    }
}

// Bar chart for Risk Group
function updateRiskGroupChart() {
    const counts = {};
    filteredData.forEach(d => { const g = d.risk_group || 'ไม่ระบุ'; counts[g] = (counts[g]||0)+1; });
    const sorted = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);
    const total = filteredData.length;
    const palette = ['#3b82f6','#f59e0b','#ef4444','#10b981','#8b5cf6','#64748b'];
    createOrUpdateChart('riskGroupChart', 'bar', {
        labels: sorted.map((k,i) => { const pct = total>0?((counts[k]/total)*100).toFixed(1):0; return `${k} (${pct}%)`; }),
        datasets: [{ label: 'ผู้ป่วย (คน)', data: sorted.map(k=>counts[k]), backgroundColor: sorted.map((_,i)=>palette[i%palette.length]), borderRadius: 6, maxBarThickness: 55 }]
    }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw.toLocaleString()} คน (${total>0?((ctx.raw/total)*100).toFixed(1):0}%)` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#e2e8f0', font: { size: 11 }, maxRotation: 30, minRotation: 0 } }, y: { grid: { color: 'rgba(51,65,85,0.35)' }, ticks: { color: '#94a3b8', callback: v => v.toLocaleString()+' คน' } } } });
}

// Bar chart for Risk Type
function updateRiskTypeChart() {
    const counts = {};
    filteredData.forEach(d => { const t = d.risk_type || 'ไม่ระบุ'; counts[t] = (counts[t]||0)+1; });
    const sorted = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);
    const total = filteredData.length;
    const palette = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ec4899','#64748b'];
    createOrUpdateChart('riskTypeChart', 'bar', {
        labels: sorted.map(k => { const pct = total>0?((counts[k]/total)*100).toFixed(1):0; return `${k} (${pct}%)`; }),
        datasets: [{ label: 'ผู้ป่วย (คน)', data: sorted.map(k=>counts[k]), backgroundColor: sorted.map((_,i)=>palette[i%palette.length]), borderRadius: 6, maxBarThickness: 55 }]
    }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw.toLocaleString()} คน (${total>0?((ctx.raw/total)*100).toFixed(1):0}%)` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#e2e8f0', font: { size: 11 }, maxRotation: 30, minRotation: 0 } }, y: { grid: { color: 'rgba(51,65,85,0.35)' }, ticks: { color: '#94a3b8', callback: v => v.toLocaleString()+' คน' } } } });
}

// Donut chart for Ampur (in/out district)
function updateAmpurChart() {
    const total = filteredData.length;
    let inCount = 0, outCount = 0;
    filteredData.forEach(d => {
        const raw = (d.ampRaw || '').trim();
        if (raw === 'เมืองเชียงราย' || raw.includes('เมืองเชียงราย')) inCount++;
        else outCount++;
    });
    const inPct = total > 0 ? ((inCount/total)*100).toFixed(1) : 0;
    const outPct = total > 0 ? ((outCount/total)*100).toFixed(1) : 0;
    createOrUpdateChart('ampurChart', 'doughnut', {
        labels: [
            `ในเขตอำเภอเมืองเชียงราย (${inPct}%)`,
            `นอกเขต (${outPct}%)`
        ],
        datasets: [{
            data: [inCount, outCount],
            backgroundColor: ['#10b981', '#f59e0b'],
            borderWidth: 0,
            hoverOffset: 6
        }]
    }, {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: {
                    padding: 12,
                    font: { size: 11.5, weight: '500' },
                    color: '#cbd5e1'
                }
            },
            tooltip: {
                callbacks: {
                    label: ctx => ` จำนวน: ${ctx.raw.toLocaleString()} คน (${total > 0 ? ((ctx.raw/total)*100).toFixed(1) : 0}%)`
                }
            }
        }
    });
}

// Generic category table renderer
function updateCategoryTable(fieldKey, tbodyId, tfootId) {
    const tbody = document.getElementById(tbodyId);
    const tfoot = document.getElementById(tfootId);
    if (!tbody) return;
    const counts = {};
    filteredData.forEach(d => {
        let val = (d[fieldKey] || '').trim();
        if (!val || val === '-' || val === 'null' || val === 'undefined') val = 'ไม่ระบุ';
        counts[val] = (counts[val] || 0) + 1;
    });
    const total = filteredData.length;
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">ไม่พบข้อมูล</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }
    const sorted = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);
    const palette = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#64748b'];
    let html = '';
    sorted.forEach((key, idx) => {
        const count = counts[key];
        const pct = total > 0 ? ((count/total)*100).toFixed(2) : '0.00';
        const dotColor = palette[idx % palette.length];
        html += `<tr>
            <td style="text-align:center;color:var(--text-muted);font-weight:500;">${idx+1}</td>
            <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dotColor};margin-right:7px;"></span><strong>${key}</strong></td>
            <td style="text-align:right;font-weight:600;">${count.toLocaleString()}</td>
            <td style="text-align:right;font-weight:600;color:${dotColor};">${pct}%</td>
        </tr>`;
    });
    tbody.innerHTML = html;
    if (tfoot) {
        tfoot.innerHTML = `<tr><td style="text-align:center;"><strong>รวม</strong></td><td><strong>รวมทั้งหมด</strong></td><td style="text-align:right;font-weight:700;">${total.toLocaleString()} คน</td><td style="text-align:right;font-weight:700;color:#3b82f6;">100.0%</td></tr>`;
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

    // 3. Nationality Chart (Top 5)
    const nationCounts = getCounts('nation');
    const totalNations = Object.values(nationCounts).reduce((a, b) => a + b, 0);
    const sortedNationKeys = Object.keys(nationCounts).sort((a, b) => nationCounts[b] - nationCounts[a]);
    
    let displayNationKeys = sortedNationKeys.slice(0, 5);
    let displayCounts = {};
    let otherCount = 0;

    sortedNationKeys.forEach((k, idx) => {
        if (idx < 5) {
            displayCounts[k] = nationCounts[k];
        } else {
            otherCount += nationCounts[k];
        }
    });

    if (otherCount > 0) {
        displayNationKeys.push('อื่นๆ');
        displayCounts['อื่นๆ'] = otherCount;
    }

    const nationLabels = displayNationKeys.map(k => {
        const count = displayCounts[k];
        const pct = totalNations > 0 ? ((count / totalNations) * 100).toFixed(1) : 0;
        return `${k}: ${count.toLocaleString()} คน (${pct}%)`;
    });

    createOrUpdateChart('nationChart', 'doughnut', {
        labels: nationLabels,
        datasets: [{
            data: displayNationKeys.map(k => displayCounts[k]),
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'],
            borderWidth: 0,
            hoverOffset: 6
        }]
    }, { 
        responsive: true, 
        maintainAspectRatio: false, 
        cutout: '62%',
        plugins: { 
            legend: { 
                position: 'bottom',
                labels: {
                    padding: 12,
                    font: { size: 11.5, weight: '500' },
                    color: '#cbd5e1'
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

    // 5. RX_RESULT Chart (ผลการรักษา - Top 5)
    renderCategoryChart('rxResultChart', 'rx_result', 'bar', [
        '#10b981', '#06b6d4', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'
    ]);

    // 6. B24_RESULT Chart (ผลตรวจ B24/HIV)
    renderCategoryChart('b24ResultChart', 'b24_result', 'doughnut', [
        '#10b981', '#ef4444', '#64748b', '#f59e0b', '#3b82f6'
    ]);

    // 7. SUMMARY Chart (ผลสรุปทางห้องปฏิบัติการ B-/B+)
    renderCategoryChart('summaryChart', 'summary', 'doughnut', [
        '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'
    ]);

    // 8. REGIS_TYPE Chart (ประเภทการขึ้นทะเบียน - Top 5)
    renderCategoryChart('regisTypeChart', 'regis_type', 'bar', [
        '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#64748b'
    ]);

    // 9. CLASSIFY Chart (การจำแนกประเภทวัณโรค)
    renderCategoryChart('classifyChart', 'classify', 'doughnut', [
        '#06b6d4', '#a855f7', '#f97316', '#10b981', '#64748b'
    ]);

    // 10. OCC_NAME_TH Chart (อาชีพของผู้ป่วย - Top 5)
    renderCategoryChart('occNameChart', 'occ_name_th', 'bar', [
        '#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'
    ]);
}

function renderCategoryChart(canvasId, fieldKey, chartType = 'doughnut', palette = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const counts = {};
    let total = 0;

    filteredData.forEach(d => {
        let val = (d[fieldKey] || '').trim();
        if (!val || val === '-' || val === 'null' || val === 'undefined') {
            val = 'ไม่ระบุ';
        }
        counts[val] = (counts[val] || 0) + 1;
        total++;
    });

    if (total === 0) return;

    const sortedKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    // นโยบายเริ่มต้น 5 รายการแรก (Top 5)
    let displayKeys = sortedKeys.slice(0, 5);
    let displayCounts = {};
    let otherCount = 0;

    sortedKeys.forEach((k, idx) => {
        if (idx < 5) {
            displayCounts[k] = counts[k];
        } else {
            otherCount += counts[k];
        }
    });

    if (otherCount > 0) {
        displayKeys.push('อื่นๆ');
        displayCounts['อื่นๆ'] = otherCount;
    }

    const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#64748b'];
    const colors = palette || defaultColors;
    const isBar = chartType === 'bar';

    // แสดงทั้งชื่อ จำนวนคน และ สัดส่วน %
    const labels = displayKeys.map(k => {
        const count = displayCounts[k];
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        return isBar ? `${k} (${pct}%)` : `${k}: ${count.toLocaleString()} คน (${pct}%)`;
    });

    const data = {
        labels: labels,
        datasets: [{
            data: displayKeys.map(k => displayCounts[k]),
            backgroundColor: displayKeys.map((k, i) => colors[i % colors.length]),
            borderWidth: 0,
            borderRadius: isBar ? 6 : 0,
            hoverOffset: isBar ? 0 : 6
        }]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: !isBar,
                position: 'bottom',
                labels: {
                    padding: 12,
                    font: { size: 11.5, weight: '500' },
                    color: '#cbd5e1'
                }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const count = context.raw || 0;
                        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                        return ` จำนวน: ${count.toLocaleString()} คน (สัดส่วน ${pct}%)`;
                    }
                }
            }
        }
    };

    if (isBar) {
        options.plugins.legend = { display: false };
        options.scales = {
            x: {
                grid: { display: false },
                ticks: { color: '#e2e8f0', font: { size: 11.5, weight: '500' }, maxRotation: 30, minRotation: 0 }
            },
            y: {
                grid: { color: 'rgba(51, 65, 85, 0.4)' },
                ticks: { color: '#94a3b8', callback: function(value) { return value.toLocaleString() + ' คน'; } }
            }
        };
    } else {
        options.cutout = '62%';
    }

    createOrUpdateChart(canvasId, chartType, data, options);
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
                let date = getField(row, ['DATE_REGIS', 'DT07_DATE_REGIS', 'START_DATE', 'DT07_START_DATE', 'Date', 'วันที่']);
                date = formatDateValue(date);

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
                let rx_result = getField(row, ['RX_RESULT', 'ผลการรักษา']) || '-';
                let b24_result = getField(row, ['B24_RESULT', 'B24', 'HIV']) || '-';
                let summary = getField(row, ['SUMMARY', 'ผลสรุป']) || '-';
                let regis_type = getField(row, ['REGIS_TYPE', 'ประเภทการขึ้นทะเบียน']) || '-';
                let classify = getField(row, ['CLASSIFY', 'การจำแนก']) || '-';
                let occ_name_th = getField(row, ['OCC_NAME_TH', 'OCC_NAME', 'OCCUPATION', 'อาชีพ']) || '-';
                let group_age_y = getField(row, ['GROUP_AGE_Y', 'GROUP_AGE', 'AGE_GROUP', 'กลุ่มอายุ', 'AGE_Y']) || '-';

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
                    risk_type: risk_type,
                    rx_result: rx_result,
                    b24_result: b24_result,
                    summary: summary,
                    regis_type: regis_type,
                    classify: classify,
                    occ_name_th: occ_name_th,
                    group_age_y: group_age_y
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
