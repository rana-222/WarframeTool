// Warframe Market 全物品价格查询
// 数据：data/wfm_items.json (slug, 英文名, 中文名, tags)
// 价格：warframe.market v2 API (通过 /api/wfm-prices 代理)

let _wfmItems = null;

async function initMarket() {
    const searchInput = document.getElementById('marketSearch');
    const dropdown = document.getElementById('marketDropdown');
    const result = document.getElementById('marketResult');

    if (!searchInput) return;

    // 加载物品数据
    try {
        const resp = await fetch('/data/wfm_items.json');
        _wfmItems = await resp.json();
    } catch (e) {
        result.innerHTML = '<div class="relic-error">物品数据加载失败: ' + e.message + '</div>';
        return;
    }

    // 搜索输入
    let searchTimer = null;
    searchInput.addEventListener('input', function() {
        const q = this.value.trim().toLowerCase();
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            if (!q) {
                dropdown.classList.remove('show');
                return;
            }
            const matches = _wfmItems.items.filter(it => {
                const en = (it.e || '').toLowerCase();
                const zh = (it.z || '').toLowerCase();
                return en.includes(q) || zh.includes(q);
            }).slice(0, 40);

            if (matches.length === 0) {
                dropdown.innerHTML = '<div class="relic-dropdown-item" style="color:var(--muted)">无匹配物品</div>';
            } else {
                dropdown.innerHTML = matches.map(it =>
                    `<div class="relic-dropdown-item" data-slug="${it.s}">
                        <span>${it.z || it.e}</span>
                        <span style="font-size:11px;color:var(--muted);font-weight:600">${it.e}</span>
                    </div>`
                ).join('');
            }
            dropdown.classList.add('show');
        }, 150);
    });

    // 点击下拉项
    dropdown.addEventListener('click', function(e) {
        const item = e.target.closest('.relic-dropdown-item');
        if (!item || !item.dataset.slug) return;
        const slug = item.dataset.slug;
        const it = _wfmItems.items.find(x => x.s === slug);
        if (it) {
            searchInput.value = it.z || it.e;
            dropdown.classList.remove('show');
            fetchMarketPrice(it);
        }
    });

    // 回车直接查询第一个匹配
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const firstItem = dropdown.querySelector('.relic-dropdown-item[data-slug]');
            if (firstItem) firstItem.click();
        }
    });

    // 点击外部关闭下拉
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.relic-search-wrap')) {
            dropdown.classList.remove('show');
        }
    });
}

async function fetchMarketPrice(item) {
    const result = document.getElementById('marketResult');
    result.innerHTML = '<div class="relic-loading">正在查询 warframe.market 价格...</div>';

    try {
        const resp = await fetch('/api/wfm-prices?items=' + item.s);
        const json = await resp.json();
        if (!json.ok) {
            result.innerHTML = '<div class="relic-error">查询失败: ' + (json.error || '未知错误') + '</div>';
            return;
        }
        const price = json.data[item.s] || {};
        renderMarketResult(item, price);
    } catch (e) {
        result.innerHTML = '<div class="relic-error">网络错误: ' + e.message + '</div>';
    }
}

function renderMarketResult(item, price) {
    const result = document.getElementById('marketResult');
    const tags = (item.t || []).map(t => `<span class="rarity-tag common" style="margin-right:4px">${t}</span>`).join('');

    const sell = price.sell;
    const buy = price.buy;
    const median = price.median;
    const sellOrders = price.sellOrders || 0;
    const buyOrders = price.buyOrders || 0;
    const topSells = price.topSells || [];
    const topBuys = price.topBuys || [];

    const sellStr = sell != null ? sell + 'p' : '-';
    const buyStr = buy != null ? buy + 'p' : '-';
    const medianStr = median != null ? median.toFixed(1) + 'p' : '-';

    const itemName = item.e;  // 聊天语句用英文名

    // 生成出售订单行（我要向卖家购买）
    const sellRows = topSells.map(o => {
        const msg = `/w ${o.user} Hi! I want to buy: x${o.quantity} "${itemName}" for ${o.platinum} platinum. (warframe.market)`;
        return `<tr>
            <td>${o.user}</td>
            <td>x${o.quantity}</td>
            <td class="relic-price-cell">${o.platinum}p</td>
            <td><button class="copy-btn" data-msg='${msg.replace(/'/g, "\\'")}'>复制</button></td>
        </tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">暂无售单</td></tr>';

    // 生成收购订单行（我要向买家出售）
    const buyRows = topBuys.map(o => {
        const msg = `/w ${o.user} Hi! I want to sell: x${o.quantity} "${itemName}" for ${o.platinum} platinum. (warframe.market)`;
        return `<tr>
            <td>${o.user}</td>
            <td>x${o.quantity}</td>
            <td style="color:var(--orange);font-weight:900">${o.platinum}p</td>
            <td><button class="copy-btn" data-msg='${msg.replace(/'/g, "\\'")}'>复制</button></td>
        </tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">暂无收单</td></tr>';

    result.innerHTML = `
        <div class="relic-summary">
            <h3>${item.z || item.e} <span style="font-size:13px;font-weight:700;color:var(--muted)">(${item.e})</span></h3>
            <div style="margin:8px 0">${tags}</div>
            <div class="relic-summary-grid">
                <div class="relic-summary-item">
                    <div class="label">中位价</div>
                    <div class="value">${medianStr}</div>
                </div>
                <div class="relic-summary-item">
                    <div class="label">最低售价</div>
                    <div class="value" style="color:var(--green-dark)">${sellStr}</div>
                </div>
                <div class="relic-summary-item">
                    <div class="label">最高收购</div>
                    <div class="value" style="color:var(--orange)">${buyStr}</div>
                </div>
                <div class="relic-summary-item">
                    <div class="label">售/收单</div>
                    <div class="value" style="font-size:18px">${sellOrders}/${buyOrders}</div>
                </div>
            </div>
        </div>

        <div class="orders-section">
            <h4 class="orders-title sell">📈 出售订单（向卖家购买）— 升序</h4>
            <table class="relic-rewards-table orders-table">
                <thead><tr><th>卖家</th><th>数量</th><th>价格</th><th>操作</th></tr></thead>
                <tbody>${sellRows}</tbody>
            </table>
        </div>

        <div class="orders-section" style="margin-top:16px">
            <h4 class="orders-title buy">📉 收购订单（向买家出售）— 降序</h4>
            <table class="relic-rewards-table orders-table">
                <thead><tr><th>买家</th><th>数量</th><th>价格</th><th>操作</th></tr></thead>
                <tbody>${buyRows}</tbody>
            </table>
        </div>

        <div style="text-align:center;margin-top:16px;color:var(--muted);font-size:13px;font-weight:600">
            数据来源: warframe.market | slug: ${item.s}
        </div>
    `;

    // 绑定复制按钮
    result.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const msg = this.dataset.msg;
            navigator.clipboard.writeText(msg).then(() => {
                const orig = this.textContent;
                this.textContent = '✓ 已复制';
                this.style.background = 'var(--green)';
                setTimeout(() => { this.textContent = orig; this.style.background = ''; }, 1500);
            }).catch(() => {
                // fallback
                const ta = document.createElement('textarea');
                ta.value = msg;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                const orig = this.textContent;
                this.textContent = '✓ 已复制';
                this.style.background = 'var(--green)';
                setTimeout(() => { this.textContent = orig; this.style.background = ''; }, 1500);
            });
        });
    });
}
