using System.Net;
using System.Text;
using System.Text.Json;
using System.Reflection;
using System.IO.Compression;

namespace WarframeTool;

internal static class Program
{
    private static HttpListener? _listener;
    // 仲裁时间表（来自 arbi.wf.wiki）
    private static long _arbysStartTs;
    private static int _arbysStepSec;
    private static string[]? _arbysNodeList;   // unique node keys
    private static int[]? _arbysSeq;            // seq[i] = index into _arbysNodeList
    private static Dictionary<string, JsonElement>? _arbysNodeMeta;  // nodeKey -> metadata
    private static Dictionary<string, JsonElement>? _solNodes;

    // 任务类型映射（arbi.wf.wiki 代码 -> 英文名）
    private static readonly Dictionary<string, string> MissionTypeMap = new()
    {
        ["MT_ALCHEMY"] = "Alchemy",
        ["MT_ARMAGEDDON"] = "Void Armageddon",
        ["MT_ARTIFACT"] = "Disruption",
        ["MT_CORRUPTION"] = "Void Flood",
        ["MT_DEFENSE"] = "Defense",
        ["MT_EVACUATION"] = "Defection",
        ["MT_EXCAVATE"] = "Excavation",
        ["MT_PURIFY"] = "Infested Salvage",
        ["MT_SURVIVAL"] = "Survival",
        ["MT_TERRITORY"] = "Interception",
        ["MT_VOID_CASCADE"] = "Void Cascade",
    };

    // 派系映射
    private static readonly Dictionary<string, string> FactionMap = new()
    {
        ["FC_INFESTATION"] = "Infested",
        ["FC_GRINEER"] = "Grineer",
        ["FC_CORPUS"] = "Corpus",
        ["FC_CROSSFIRE"] = "Crossfire",
        ["FC_SENTIENT"] = "Sentient",
    };

    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();

        // 预加载仲裁数据
        LoadArbitrationData();

        // 启动本地 HTTP 服务
        StartHttpServer();

        // 启动 WebView2 窗口
        Application.Run(new MainForm());
    }

    private static void LoadArbitrationData()
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly();

            // 加载仲裁时间表（arbi.wf.wiki 格式）
            using var schedStream = asm.GetManifestResourceStream("WarframeTool.Resources.data.arbys.schedule.v2.json");
            if (schedStream != null)
            {
                using var doc = JsonDocument.Parse(schedStream);
                var root = doc.RootElement;
                _arbysStartTs = root.GetProperty("startTs").GetInt64();
                _arbysStepSec = root.GetProperty("stepSec").GetInt32();
                _arbysNodeList = root.GetProperty("nodes").EnumerateArray()
                    .Select(n => n.GetString() ?? "").ToArray();
                _arbysSeq = root.GetProperty("seq").EnumerateArray()
                    .Select(n => n.GetInt32()).ToArray();
            }

            // 加载仲裁节点元数据
            using var metaStream = asm.GetManifestResourceStream("WarframeTool.Resources.data.arbys.nodes.json");
            if (metaStream != null)
            {
                using var doc = JsonDocument.Parse(metaStream);
                _arbysNodeMeta = new Dictionary<string, JsonElement>();
                foreach (var prop in doc.RootElement.GetProperty("nodes").EnumerateObject())
                    _arbysNodeMeta[prop.Name] = prop.Value.Clone();
            }

            // 加载 solNodes.json（用于裂缝节点翻译）
            using var solStream = asm.GetManifestResourceStream("WarframeTool.Resources.data.solNodes.json");
            if (solStream != null)
            {
                using var doc = JsonDocument.Parse(solStream);
                _solNodes = new Dictionary<string, JsonElement>();
                foreach (var prop in doc.RootElement.EnumerateObject())
                    _solNodes[prop.Name] = prop.Value.Clone();
            }
        }
        catch { /* 数据加载失败时仲裁功能不可用 */ }
    }

    private static void StartHttpServer()
    {
        _listener = new HttpListener();
        _listener.Prefixes.Add("http://127.0.0.1:8765/");
        _listener.Start();

        ThreadPool.QueueUserWorkItem(_ =>
        {
            while (_listener.IsListening)
            {
                try
                {
                    var ctx = _listener.GetContext();
                    ThreadPool.QueueUserWorkItem(_ => HandleRequest(ctx));
                }
                catch { break; }
            }
        });
    }

    private static void HandleRequest(HttpListenerContext ctx)
    {
        try
        {
            var path = ctx.Request.Url?.AbsolutePath ?? "/";
            if (path == "/") path = "/index.html";

            if (path.StartsWith("/api/"))
            {
                HandleApi(ctx, path);
                return;
            }

            ServeStaticFile(ctx, path);
        }
        catch
        {
            try { ctx.Response.StatusCode = 500; ctx.Response.Close(); } catch { }
        }
    }

    private static void ServeStaticFile(HttpListenerContext ctx, string path)
    {
        var asm = Assembly.GetExecutingAssembly();
        var resourcePath = "WarframeTool.Resources" + path.Replace('/', '.');

        var stream = asm.GetManifestResourceStream(resourcePath);
        if (stream == null)
        {
            // 列出所有资源名用于调试（仅在找不到时）
            var names = asm.GetManifestResourceNames();
            foreach (var n in names)
            {
                // 尝试模糊匹配
                if (n.Contains(Path.GetFileNameWithoutExtension(path)))
                {
                    stream = asm.GetManifestResourceStream(n);
                    break;
                }
            }
        }

        if (stream == null)
        {
            ctx.Response.StatusCode = 404;
            ctx.Response.Close();
            return;
        }

        var ext = Path.GetExtension(path).ToLowerInvariant();
        var contentType = ext switch
        {
            ".html" => "text/html; charset=utf-8",
            ".css" => "text/css; charset=utf-8",
            ".js" => "application/javascript; charset=utf-8",
            ".json" => "application/json; charset=utf-8",
            ".txt" => "text/plain; charset=utf-8",
            _ => "application/octet-stream"
        };

        ctx.Response.ContentType = contentType;
        ctx.Response.StatusCode = 200;
        stream.CopyTo(ctx.Response.OutputStream);
        ctx.Response.Close();
    }

    private static void HandleApi(HttpListenerContext ctx, string path)
    {
        ctx.Response.ContentType = "application/json; charset=utf-8";
        byte[] data;

        if (path == "/api/fissures")
            data = Encoding.UTF8.GetBytes(GetFissures());
        else if (path == "/api/arbitrations")
            data = Encoding.UTF8.GetBytes(GetArbitrations());
        else if (path.StartsWith("/api/wfm-prices"))
            data = Encoding.UTF8.GetBytes(GetWfmPrices(ctx.Request.Url?.Query ?? ""));
        else
        {
            ctx.Response.StatusCode = 404;
            ctx.Response.Close();
            return;
        }

        ctx.Response.StatusCode = 200;
        ctx.Response.OutputStream.Write(data, 0, data.Length);
        ctx.Response.Close();
    }

    private static string GetFissures()
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            var json = http.GetStringAsync("https://api.tenno.tools/worldstate/pc/fissures").Result;
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var fissuresEl = root.GetProperty("fissures").GetProperty("data");

            var result = new List<object>();
            foreach (var f in fissuresEl.EnumerateArray())
            {
                var location = f.GetProperty("location").GetString() ?? "";
                var parts = location.Split('/');
                var nodeName = parts.Length > 0 ? parts[0] : location;
                var planet = parts.Length > 1 ? parts[1] : "";

                result.Add(new
                {
                    id = f.TryGetProperty("id", out var id) ? id.GetString() : "",
                    node = location,
                    nodeName = nodeName,
                    planet = planet,
                    missionType = f.GetProperty("missionType").GetString() ?? "",
                    enemy = f.GetProperty("faction").GetString() ?? "",
                    tier = f.GetProperty("tier").GetString() ?? "",
                    isStorm = false,
                    isHard = f.TryGetProperty("hard", out var hard) && hard.GetBoolean(),
                    activation = f.GetProperty("start").GetInt64(),
                    expiry = f.GetProperty("end").GetInt64()
                });
            }

            return JsonSerializer.Serialize(new { ok = true, data = result });
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { ok = false, error = ex.Message });
        }
    }

    private static string GetArbitrations()
    {
        if (_arbysNodeList == null || _arbysSeq == null || _arbysNodeMeta == null)
            return JsonSerializer.Serialize(new { ok = false, error = "数据未加载" });

        var nowTs = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var todayStart = (nowTs / 86400) * 86400;
        long currentHourIdx = (nowTs / _arbysStepSec) - (_arbysStartTs / _arbysStepSec);
        long startIdx = (todayStart / _arbysStepSec) - (_arbysStartTs / _arbysStepSec);
        if (startIdx < 0) startIdx = 0;

        int hoursAhead = 720;
        int maxIdx = (int)Math.Min(startIdx + hoursAhead, (long)_arbysSeq.Length);
        var result = new List<object>();

        for (int i = (int)startIdx; i < maxIdx; i++)
        {
            var seqIdx = _arbysSeq[i];
            if (seqIdx < 0 || seqIdx >= _arbysNodeList.Length) continue;
            var nodeKey = _arbysNodeList[seqIdx];
            var startTs = _arbysStartTs + (long)i * _arbysStepSec;

            string node = nodeKey, missionType = "Unknown", faction = "Unknown";
            if (_arbysNodeMeta.TryGetValue(nodeKey, out var meta))
            {
                var mtCode = meta.TryGetProperty("missionType", out var mt) ? mt.GetString() ?? "" : "";
                missionType = MissionTypeMap.TryGetValue(mtCode, out var mtEn) ? mtEn
                    : (meta.TryGetProperty("missionNameZh", out var mtZh) ? mtZh.GetString() ?? "Unknown" : "Unknown");

                var fcCode = meta.TryGetProperty("faction", out var fc) ? fc.GetString() ?? "" : "";
                faction = FactionMap.TryGetValue(fcCode, out var fcEn) ? fcEn
                    : (meta.TryGetProperty("factionNameZh", out var fcZh) ? fcZh.GetString() ?? "Unknown" : "Unknown");

                var nameZh = meta.TryGetProperty("nameZh", out var nz) ? nz.GetString() ?? "" : "";
                var sysZh = meta.TryGetProperty("systemNameZh", out var sz) ? sz.GetString() ?? "" : "";
                node = string.IsNullOrEmpty(sysZh) ? (string.IsNullOrEmpty(nameZh) ? nodeKey : nameZh) : $"{nameZh} ({sysZh})";
            }

            result.Add(new
            {
                start = startTs,
                end = startTs + _arbysStepSec,
                nodeKey = nodeKey,
                node = node,
                missionType = missionType,
                faction = faction,
                isCurrent = (long)i == currentHourIdx
            });
        }

        return JsonSerializer.Serialize(new { ok = true, data = result });
    }

    // Warframe Market 价格代理（带内存缓存）
    private static readonly Dictionary<string, (long ts, JsonElement data)> _wfmCache = new();
    private static readonly object _wfmLock = new();

    private static string GetWfmPrices(string query)
    {
        // 解析 ?items=slug1,slug2,...
        var itemsParam = "";
        foreach (var pair in query.TrimStart('?').Split('&'))
        {
            var eq = pair.IndexOf('=');
            if (eq > 0 && pair.Substring(0, eq) == "items")
            {
                itemsParam = Uri.UnescapeDataString(pair.Substring(eq + 1));
                break;
            }
        }
        var slugs = itemsParam.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (slugs.Length == 0)
            return JsonSerializer.Serialize(new { ok = false, error = "缺少 items 参数" });

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var result = new Dictionary<string, object>();

        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        foreach (var slug in slugs)
        {
            // 检查缓存（10 分钟）
            lock (_wfmLock)
            {
                if (_wfmCache.TryGetValue(slug, out var cached) && now - cached.ts < 600)
                {
                    result[slug] = JsonSerializer.Deserialize<object>(cached.data.GetRawText())!;
                    continue;
                }
            }

            // 构建价格数据对象
            double? median = null;
            int? minSell = null;
            int? maxBuy = null;
            int sellCount = 0, buyCount = 0;
            var topSells = new List<object>();
            var topBuys = new List<object>();
            string? errMsg = null;

            // 1. 获取订单（top 5 sell + top 5 buy）
            try
            {
                var url = $"https://api.warframe.market/v2/orders/item/{slug}/top";
                var json = http.GetStringAsync(url).Result;
                using var doc = JsonDocument.Parse(json);
                var dataEl = doc.RootElement.GetProperty("data");
                var sells = dataEl.GetProperty("sell");
                var buys = dataEl.GetProperty("buy");

                // 提取并排序
                var sellList = new List<(int platinum, int quantity, string user)>();
                var buyList = new List<(int platinum, int quantity, string user)>();
                foreach (var o in sells.EnumerateArray())
                {
                    sellCount++;
                    var p = o.GetProperty("platinum").GetInt32();
                    var q = o.TryGetProperty("quantity", out var qel) ? qel.GetInt32() : 1;
                    var u = o.TryGetProperty("user", out var uel) && uel.TryGetProperty("ingameName", out var nel) ? nel.GetString() ?? "" : "";
                    sellList.Add((p, q, u));
                    if (minSell == null || p < minSell) minSell = p;
                }
                foreach (var o in buys.EnumerateArray())
                {
                    buyCount++;
                    var p = o.GetProperty("platinum").GetInt32();
                    var q = o.TryGetProperty("quantity", out var qel) ? qel.GetInt32() : 1;
                    var u = o.TryGetProperty("user", out var uel) && uel.TryGetProperty("ingameName", out var nel) ? nel.GetString() ?? "" : "";
                    buyList.Add((p, q, u));
                    if (maxBuy == null || p > maxBuy) maxBuy = p;
                }

                // 售价升序，收购价降序，取前 3
                foreach (var o in sellList.OrderBy(x => x.platinum).Take(3))
                    topSells.Add(new { platinum = o.platinum, quantity = o.quantity, user = o.user });
                foreach (var o in buyList.OrderByDescending(x => x.platinum).Take(3))
                    topBuys.Add(new { platinum = o.platinum, quantity = o.quantity, user = o.user });
            }
            catch (Exception ex)
            {
                errMsg = ex.Message;
            }

            // 2. 获取统计中位数
            try
            {
                var url = $"https://api.warframe.market/v1/items/{slug}/statistics";
                var json = http.GetStringAsync(url).Result;
                using var doc = JsonDocument.Parse(json);
                var stats = doc.RootElement.GetProperty("payload").GetProperty("statistics_closed").GetProperty("90days");
                if (stats.GetArrayLength() > 0)
                {
                    var last = stats[stats.GetArrayLength() - 1];
                    if (last.TryGetProperty("median", out var med))
                        median = med.GetDouble();
                }
            }
            catch { /* 统计不可用时忽略 */ }

            var priceData = new
            {
                slug,
                sell = minSell,
                buy = maxBuy,
                median,
                topSells,
                topBuys,
                sellOrders = sellCount,
                buyOrders = buyCount,
                error = errMsg
            };

            var jsonStr = JsonSerializer.Serialize(priceData);
            lock (_wfmLock)
            {
                using var doc = JsonDocument.Parse(jsonStr);
                _wfmCache[slug] = (now, doc.RootElement.Clone());
            }
            result[slug] = priceData;

            // 遵守 wfm 3 req/sec 限流（每个 slug 调了 2 个接口）
            Thread.Sleep(700);
        }

        return JsonSerializer.Serialize(new { ok = true, data = result });
    }
}
