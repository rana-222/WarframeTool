// 遗物价格计算器
// 数据源：本地 data/relics_compact.json (来自 WFCD warframe-items)
// 价格：warframe.market v2 API (通过 /api/wfm-prices 代理)

const RELIC_DROP_RATES = {
    intact:      { Common: 25.33, Uncommon: 11.00, Rare: 2.00 },
    exceptional: { Common: 23.33, Uncommon: 13.00, Rare: 4.00 },
    flawless:    { Common: 20.00, Uncommon: 17.00, Rare: 6.00 },
    radiant:     { Common: 16.67, Uncommon: 20.00, Rare: 10.00 },
};

const RARITY_LABELS = { Common: '普通', Uncommon: '优良', Rare: '稀有' };
const REFINE_LABELS = { intact: '完整', exceptional: '优良', flawless: '无瑕', radiant: '光辉' };

let _relicsData = null;
let _currentRelic = null;

async function initRelics() {
    const result = document.getElementById('relicResult');
    const searchInput = document.getElementById('relicSearch');
    const dropdown = document.getElementById('relicDropdown');

    // 加载遗物数据
    try {
        const resp = await fetch('/data/relics_compact.json');
        _relicsData = await resp.json();
    } catch (e) {
        result.innerHTML = '<div class="relic-error">遗物数据加载失败: ' + e.message + '</div>';
        return;
    }

    // 搜索输入（支持中英文、空格、纪名缩写：前纪A3 / 前A3 / A3 均可）
    searchInput.addEventListener('input', function() {
        // 去除查询词中所有空格并转小写
        let q = this.value.trim().toLowerCase().replace(/\s+/g, '');
        if (!q) {
            dropdown.classList.remove('show');
            return;
        }
        const matches = _relicsData.relics.filter(r => {
            // 英文名去空格："Axi A3" → "axia3"
            const en = (r.n || '').toLowerCase().replace(/\s+/g, '');
            // 中文名去空格："前纪 A3 遗物" → "前纪a3遗物"
            const zh = (r.z || '').toLowerCase().replace(/\s+/g, '');
            // 中文纪名缩写：去掉"纪"字 → "前a3遗物"，支持"前A3"这类输入
            const zhAbbr = zh.replace(/纪/g, '');
            return en.includes(q) || zh.includes(q) || zhAbbr.includes(q);
        }).slice(0, 30);
        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="relic-dropdown-item" style="color:var(--muted)">无匹配遗物</div>';
        } else {
            dropdown.innerHTML = matches.map(r =>
                `<div class="relic-dropdown-item" data-url="${r.u}">
                    <span>${r.z || r.n}</span>
                    <span class="relic-badge ${r.v ? 'vaulted' : 'active'}">${r.v ? '已入库' : '现役'}</span>
                </div>`
            ).join('');
        }
        dropdown.classList.add('show');
    });

    // 点击下拉项
    dropdown.addEventListener('click', function(e) {
        const item = e.target.closest('.relic-dropdown-item');
        if (!item || !item.dataset.url) return;
        const relic = _relicsData.relics.find(r => r.u === item.dataset.url);
        if (relic) {
            selectRelic(relic);
            searchInput.value = relic.z || relic.n;
            dropdown.classList.remove('show');
        }
    });

    // 点击外部关闭下拉
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.relic-search-wrap')) {
            dropdown.classList.remove('show');
        }
    });

    // 精炼等级切换
    document.querySelectorAll('input[name="relicRefine"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (_currentRelic) loadRelicPrices(_currentRelic);
        });
    });
}

function selectRelic(relic) {
    _currentRelic = relic;
    loadRelicPrices(relic);
}

function getRefineLevel() {
    const radio = document.querySelector('input[name="relicRefine"]:checked');
    return radio ? radio.value : 'intact';
}

async function loadRelicPrices(relic) {
    const result = document.getElementById('relicResult');
    const refine = getRefineLevel();
    const rates = RELIC_DROP_RATES[refine];

    result.innerHTML = '<div class="relic-loading">正在查询 warframe.market 价格...</div>';

    // 收集所有需要查询的物品 urlName（遗物本身 + 6 个内容物）
    const slugs = [relic.u, ...relic.rewards.map(r => r.u).filter(Boolean)];

    try {
        const resp = await fetch('/api/wfm-prices?items=' + slugs.join(','));
        const json = await resp.json();
        if (!json.ok) {
            result.innerHTML = '<div class="relic-error">价格查询失败: ' + (json.error || '未知错误') + '</div>';
            return;
        }
        const prices = json.data;
        renderRelicResult(relic, prices, refine, rates);
    } catch (e) {
        result.innerHTML = '<div class="relic-error">网络错误: ' + e.message + '</div>';
    }
}

function renderRelicResult(relic, prices, refine, rates) {
    const result = document.getElementById('relicResult');

    // 遗物自身价格（使用统计中位数，避免单个异常高价订单）
    const relicPrice = prices[relic.u] || {};
    const relicMedian = relicPrice.median;
    const relicSell = relicPrice.sell;
    const relicBuy = relicPrice.buy;
    // 成本优先用中位数，没有则用最低售价
    const cost = relicMedian != null ? relicMedian : (relicSell || 0);

    // 计算每个内容物的期望价值（使用中位数作为代表性价格）
    const rewardRows = relic.rewards.map(r => {
        const p = prices[r.u] || {};
        const median = p.median;
        const sell = p.sell;
        const buy = p.buy;
        const rate = rates[r.r] || 0;
        const priceForEv = median != null ? median : sell;
        const ev = priceForEv != null ? (priceForEv * rate / 100) : null;
        return { ...r, median, sell, buy, rate, ev };
    });

    // 总期望
    const totalEv = rewardRows.reduce((sum, r) => sum + (r.ev || 0), 0);

    // 利润 = 期望回报 - 遗物成本
    const profit = totalEv - cost;

    // 渲染
    const rowsHtml = rewardRows.map(r => {
        const rarityClass = r.r.toLowerCase();
        const evStr = r.ev != null ? r.ev.toFixed(2) + 'p' : '-';
        const medianStr = r.median != null ? r.median.toFixed(1) + 'p' : '-';
        const sellStr = r.sell != null ? r.sell + 'p' : '-';
        const buyStr = r.buy != null ? r.buy + 'p' : '-';
        const displayName = r.z || r.n;
        const enName = r.z && r.z !== r.n ? `<br><span style="font-size:11px;color:var(--muted);font-weight:600">${r.n}</span>` : '';
        return `<tr>
            <td><span class="rarity-tag ${rarityClass}">${RARITY_LABELS[r.r]}</span></td>
            <td>${displayName}${enName}</td>
            <td>${r.rate.toFixed(2)}%</td>
            <td class="relic-price-cell">${medianStr}</td>
            <td>${sellStr}</td>
            <td>${buyStr}</td>
            <td class="relic-ev-cell">${evStr}</td>
        </tr>`;
    }).join('');

    const relicMedianStr = relicMedian != null ? relicMedian.toFixed(1) + 'p' : '-';
    const relicSellStr = relicSell != null ? relicSell + 'p' : '-';
    const profitClass = profit >= 0 ? 'profit' : 'loss';
    const profitSign = profit >= 0 ? '+' : '';
    const relicDisplayName = relic.z || relic.n;
    const relicEnName = relic.z && relic.z !== relic.n ? ` <span style="font-size:13px;font-weight:600;color:var(--muted)">(${relic.n})</span>` : '';

    result.innerHTML = `
        <div class="relic-summary">
            <h3>${relicDisplayName}${relicEnName} <span style="font-size:13px;font-weight:700;color:var(--muted)">(${REFINE_LABELS[refine]}) ${relic.v ? '🔒 已入库' : '✅ 现役'}</span></h3>
            <div class="relic-summary-grid">
                <div class="relic-summary-item">
                    <div class="label">遗物中位价</div>
                    <div class="value">${relicMedianStr}</div>
                </div>
                <div class="relic-summary-item">
                    <div class="label">最低售价</div>
                    <div class="value" style="font-size:16px">${relicSellStr}</div>
                </div>
                <div class="relic-summary-item">
                    <div class="label">期望回报</div>
                    <div class="value">${totalEv.toFixed(2)}p</div>
                </div>
                <div class="relic-summary-item">
                    <div class="label">利润</div>
                    <div class="value ${profitClass}">${profitSign}${profit.toFixed(2)}p</div>
                </div>
                <div class="relic-summary-item">
                    <div class="label">期望回报率</div>
                    <div class="value ${profitClass}">${cost > 0 ? (profitSign + (profit / cost * 100).toFixed(1) + '%') : '-'}</div>
                </div>
            </div>
        </div>
        <table class="relic-rewards-table">
            <thead>
                <tr>
                    <th>稀有度</th>
                    <th>物品</th>
                    <th>掉落率</th>
                    <th>中位价</th>
                    <th>最低售</th>
                    <th>最高收</th>
                    <th>期望价值</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

// 侧边栏展开/收起
function initSidebar() {
    const sidebar = document.getElementById('mainSidebar');
    const toggle = document.getElementById('sidebarToggle');

    // 从 localStorage 读取状态
    const collapsed = localStorage.getItem('sidebarCollapsed') === '1';
    if (collapsed) {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
    }

    toggle.addEventListener('click', function() {
        const isCollapsed = sidebar.classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed', isCollapsed);
        localStorage.setItem('sidebarCollapsed', isCollapsed ? '1' : '0');
    });
}
