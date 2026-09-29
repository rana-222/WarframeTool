"""
Warframe 裂罅计算器 + 虚空裂缝/仲裁任务 后端服务
依赖：仅使用 Python 标准库
运行：python server.py
访问：http://127.0.0.1:8000

数据源说明：
- 虚空裂缝：tenno.tools API（warframestat.us 被 Cloudflare 拦截，无法从服务器直连）
- 仲裁任务：本地 data/arbys.txt（来自 browse.wf 的 GitHub 仓库，覆盖 2024-2029）
  browse.wf 域名被 Cloudflare 拦截，但 raw.githubusercontent.com 偶尔可用；
  arbys.txt 是预计算的完整仲裁时间表，已下载到本地作为可靠数据源。
- 节点信息：本地 data/solNodes.json（来自 WFCD，452 个节点）
"""
import http.server
import urllib.request
import ssl
import json
import time
import os
from urllib.parse import urlparse

PORT = 8000
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------- 外部数据源 ----------
# 虚空裂缝（tenno.tools，PC 平台）
FISSURES_URL = "https://api.tenno.tools/worldstate/pc/fissures"
# 仲裁时间表（来自 arbi.wf.wiki，权威数据源）
ARBYS_SCHEDULE_LOCAL = os.path.join(ROOT_DIR, "data", "arbys.schedule.v2.json")
ARBYS_NODES_LOCAL = os.path.join(ROOT_DIR, "data", "arbys.nodes.json")
# 节点映射表（本地缓存，来自 WFCD，用于裂缝节点翻译）
SOLNODES_LOCAL = os.path.join(ROOT_DIR, "data", "solNodes.json")
SOLNODES_URL = "https://raw.githubusercontent.com/WFCD/warframe-worldstate-data/master/data/solNodes.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}

# SSL 上下文（降低安全级别以兼容部分服务器）
SSL_CTX = ssl.create_default_context()
SSL_CTX.set_ciphers("DEFAULT@SECLEVEL=1")

# 仲裁任务类型映射（arbi.wf.wiki 代码 -> 英文名）
MISSION_TYPE_MAP = {
    "MT_ALCHEMY": "Alchemy",
    "MT_ARMAGEDDON": "Void Armageddon",
    "MT_ARTIFACT": "Disruption",
    "MT_CORRUPTION": "Void Flood",
    "MT_DEFENSE": "Defense",
    "MT_EVACUATION": "Defection",
    "MT_EXCAVATE": "Excavation",
    "MT_PURIFY": "Infested Salvage",
    "MT_SURVIVAL": "Survival",
    "MT_TERRITORY": "Interception",
    "MT_VOID_CASCADE": "Void Cascade",
}

# 仲裁派系映射
FACTION_MAP = {
    "FC_INFESTATION": "Infested",
    "FC_GRINEER": "Grineer",
    "FC_CORPUS": "Corpus",
    "FC_CROSSFIRE": "Crossfire",
    "FC_SENTIENT": "Sentient",
}

# 内存缓存
_CACHE = {
    "fissures": (0, None),
    "arbitrations_schedule": (0, None),  # (timestamp, {"startTs","stepSec","nodes","seq"})
    "arbitrations_nodes": (0, None),     # (timestamp, {nodeKey: meta})
    "solnodes": (0, None),
}
CACHE_TTL_FISSURES = 60      # 裂缝 60 秒
CACHE_TTL_ARBYS = 3600       # 仲裁数据 1 小时
CACHE_TTL_SOLNODES = 86400   # 节点表 1 天


def fetch(url, timeout=20):
    """带重试的 HTTP GET，返回文本"""
    last_err = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
                return resp.read().decode("utf-8")
        except Exception as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    raise last_err


def get_solnodes():
    """获取节点映射表（优先本地文件，可选 GitHub 刷新）"""
    now = time.time()
    ts, cached = _CACHE["solnodes"]
    if cached and now - ts < CACHE_TTL_SOLNODES:
        return cached
    # 优先从本地文件加载
    try:
        with open(SOLNODES_LOCAL, "r", encoding="utf-8") as f:
            nodes = json.load(f)
        _CACHE["solnodes"] = (now, nodes)
        return nodes
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    # 本地文件不可用，从 GitHub 获取
    text = fetch(SOLNODES_URL)
    nodes = json.loads(text)
    _CACHE["solnodes"] = (now, nodes)
    return nodes


def get_arbitration_schedule():
    """
    获取仲裁时间表（来自 arbi.wf.wiki）。
    格式: {"startTs":..., "stepSec":3600, "nodes":[nodeKey,...], "seq":[index,...]}
    seq[i] 是 nodes 数组的索引，nodes[seq[i]] 即为第 i 小时的 nodeKey。
    """
    now = time.time()
    ts, cached = _CACHE["arbitrations_schedule"]
    if cached and now - ts < CACHE_TTL_ARBYS:
        return cached
    with open(ARBYS_SCHEDULE_LOCAL, "r", encoding="utf-8") as f:
        schedule = json.load(f)
    _CACHE["arbitrations_schedule"] = (now, schedule)
    return schedule


def get_arbitration_nodes_meta():
    """
    获取仲裁节点元数据（来自 arbi.wf.wiki）。
    格式: {"nodes": {nodeKey: {missionType, missionNameZh, faction, factionNameZh, nameZh, systemNameZh, ...}}}
    """
    now = time.time()
    ts, cached = _CACHE["arbitrations_nodes"]
    if cached and now - ts < CACHE_TTL_ARBYS:
        return cached
    with open(ARBYS_NODES_LOCAL, "r", encoding="utf-8") as f:
        data = json.load(f)
    _CACHE["arbitrations_nodes"] = (now, data["nodes"])
    return data["nodes"]


def get_fissures():
    """获取虚空裂缝数据（来自 tenno.tools）"""
    now = time.time()
    ts, cached = _CACHE["fissures"]
    if cached and now - ts < CACHE_TTL_FISSURES:
        return cached

    text = fetch(FISSURES_URL)
    raw = json.loads(text)
    # tenno.tools 格式: {"time":..., "fissures": {"time":..., "data":[...]}}
    fissures_raw = raw.get("fissures", {}).get("data", [])
    result = []
    for f in fissures_raw:
        result.append({
            "id": f.get("id"),
            "node": f.get("location"),        # tenno.tools 用 location
            "missionType": f.get("missionType"),
            "enemy": f.get("faction"),         # tenno.tools 用 faction
            "tier": f.get("tier"),
            "tierNum": f.get("tierNum"),
            "isStorm": f.get("isStorm", False),
            "isHard": f.get("hard", False),    # tenno.tools 用 hard
            "activation": _ts_to_iso(f.get("start")),
            "expiry": _ts_to_iso(f.get("end")),
        })
    _CACHE["fissures"] = (now, result)
    return result


def _ts_to_iso(ts):
    """将 Unix 时间戳转为 ISO 8601 字符串（供前端倒计时使用）"""
    if ts is None:
        return None
    try:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(ts)))
    except (ValueError, TypeError):
        return None


def get_arbitrations(hours_ahead=720):
    """
    获取仲裁任务队列（数据源: arbi.wf.wiki）。
    根据当前时间计算索引，从时间表中取出当前及未来 hours_ahead 小时的仲裁。
    """
    schedule = get_arbitration_schedule()
    nodes_meta = get_arbitration_nodes_meta()
    now_ts = int(time.time())

    start_ts = schedule["startTs"]
    step_sec = schedule["stepSec"]
    node_list = schedule["nodes"]
    seq = schedule["seq"]

    # 从今天 0 点开始，覆盖完整日历日
    today_start = (now_ts // 86400) * 86400
    current_hour_idx = (now_ts // step_sec) - (start_ts // step_sec)
    start_idx = (today_start // step_sec) - (start_ts // step_sec)

    result = []
    if start_idx < 0:
        start_idx = 0
    if start_idx >= len(seq):
        return result

    end_idx = min(start_idx + hours_ahead, len(seq))
    for i in range(start_idx, end_idx):
        node_key = node_list[seq[i]]
        arbi_start_ts = start_ts + i * step_sec
        meta = nodes_meta.get(node_key, {})
        mission_type = MISSION_TYPE_MAP.get(meta.get("missionType", ""), meta.get("missionNameZh", "Unknown"))
        faction = FACTION_MAP.get(meta.get("faction", ""), meta.get("factionNameZh", "Unknown"))
        # 构造 "NodeName (Planet)" 格式供前端 zhNode 翻译
        node_name = meta.get("nameZh", node_key)
        planet = meta.get("systemNameZh", "")
        node_display = f"{node_name} ({planet})" if planet else node_name
        result.append({
            "start": arbi_start_ts,
            "end": arbi_start_ts + step_sec,
            "nodeKey": node_key,
            "node": node_display,
            "missionType": mission_type,
            "faction": faction,
            "isCurrent": i == current_hour_idx,
        })
    return result


# ---------- Warframe Market 价格代理 ----------
WFM_PRICE_TTL = 600  # 价格缓存 10 分钟
_wfm_price_cache = {}

def get_wfm_price(slug):
    """获取单个物品的 warframe.market 价格（统计中位数 + 订单列表）"""
    now = time.time()
    if slug in _wfm_price_cache:
        ts, data = _wfm_price_cache[slug]
        if now - ts < WFM_PRICE_TTL:
            return data

    result = {"slug": slug, "sell": None, "buy": None, "median": None,
              "topSells": [], "topBuys": [], "sellOrders": 0, "buyOrders": 0}

    # 1. 获取订单（top 5 sell + top 5 buy）
    try:
        text = fetch(f"https://api.warframe.market/v2/orders/item/{slug}/top")
        raw = json.loads(text)
        sells = raw.get("data", {}).get("sell", [])
        buys = raw.get("data", {}).get("buy", [])

        # 售价升序排列（最低价在前）
        sells_sorted = sorted(sells, key=lambda o: o["platinum"])
        # 收购价降序排列（最高价在前）
        buys_sorted = sorted(buys, key=lambda o: o["platinum"], reverse=True)

        result["sell"] = sells_sorted[0]["platinum"] if sells_sorted else None
        result["buy"] = buys_sorted[0]["platinum"] if buys_sorted else None
        result["sellOrders"] = len(sells)
        result["buyOrders"] = len(buys)

        # 取前 3 个订单，保留卖家/买家信息
        result["topSells"] = [
            {"platinum": o["platinum"], "quantity": o.get("quantity", 1),
             "user": o.get("user", {}).get("ingameName", "")}
            for o in sells_sorted[:3]
        ]
        result["topBuys"] = [
            {"platinum": o["platinum"], "quantity": o.get("quantity", 1),
             "user": o.get("user", {}).get("ingameName", "")}
            for o in buys_sorted[:3]
        ]
    except Exception as e:
        result["error"] = str(e)

    # 2. 获取统计中位数
    try:
        text = fetch(f"https://api.warframe.market/v1/items/{slug}/statistics")
        raw = json.loads(text)
        stats = raw.get("payload", {}).get("statistics_closed", {}).get("90days", [])
        # 取最近一条统计数据的 median
        if stats:
            result["median"] = stats[-1].get("median")
    except Exception:
        pass  # 统计不可用时忽略

    _wfm_price_cache[slug] = (now, result)
    return result


def get_wfm_prices(slugs):
    """批量获取多个物品的价格"""
    results = {}
    for slug in slugs:
        results[slug] = get_wfm_price(slug)
        time.sleep(0.7)  # 遵守 wfm 3 req/sec 限流（每个 slug 调 2 个接口）
    return results


# ---------- HTTP 服务 ----------
class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path):
        if not os.path.isfile(path):
            self.send_error(404, "Not Found")
            return
        ext = os.path.splitext(path)[1].lower()
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".png": "image/png",
            ".ico": "image/x-icon",
        }.get(ext, "application/octet-stream")
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/fissures":
            try:
                self._send_json({"ok": True, "data": get_fissures()})
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, status=502)
            return

        if path == "/api/arbitrations":
            try:
                self._send_json({"ok": True, "data": get_arbitrations()})
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, status=502)
            return

        if path == "/api/wfm-prices":
            query = urlparse(self.path).query
            params = {}
            for pair in query.split("&"):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    params[k] = v
            items_str = params.get("items", "")
            slugs = [s.strip() for s in items_str.split(",") if s.strip()]
            if not slugs:
                self._send_json({"ok": False, "error": "缺少 items 参数"}, status=400)
                return
            try:
                prices = get_wfm_prices(slugs)
                self._send_json({"ok": True, "data": prices})
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, status=502)
            return

        # 静态文件
        if path == "/":
            path = "/Code_20260926(7).html"
        safe_path = os.path.normpath(path.lstrip("/"))
        full = os.path.join(ROOT_DIR, safe_path)
        if not full.startswith(ROOT_DIR):
            self.send_error(403, "Forbidden")
            return
        self._send_file(full)


def main():
    server = http.server.ThreadingHTTPServer(("", PORT), Handler)
    print(f"Warframe Tool 服务已启动: http://127.0.0.1:{PORT}")
    print(f"  裂缝接口: http://127.0.0.1:{PORT}/api/fissures  (数据源: tenno.tools)")
    print(f"  仲裁接口: http://127.0.0.1:{PORT}/api/arbitrations  (数据源: browse.wf GitHub)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.shutdown()


if __name__ == "__main__":
    main()
