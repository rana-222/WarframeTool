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

    // 设置：关闭窗口行为 (exit / tray)
    public static string CloseBehavior = "exit";

    // 当前程序版本（来自程序集 Version，如 1.1.0）
    public static readonly Version AppVersion = CreateAppVersion();

    private static Version CreateAppVersion()
    {
        var v = Assembly.GetExecutingAssembly().GetName().Version!;
        return new Version(v.Major, v.Minor, Math.Max(v.Build, 0));
    }

    // 设置持久化文件
    private static string SettingsPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "WarframeTool", "settings.json");

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

        // 加载用户设置
        LoadSettings();

        // 启动后台世界状态轮询（warframestat.us，每 60 秒刷新，前端直接读缓存）
        StartWorldStatePolling();

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
        else if (path == "/api/worldstate")
            data = Encoding.UTF8.GetBytes(GetWorldState());
        else if (path == "/api/arbitrations")
            data = Encoding.UTF8.GetBytes(GetArbitrations());
        else if (path.StartsWith("/api/wfm-prices"))
            data = Encoding.UTF8.GetBytes(GetWfmPrices(ctx.Request.Url?.Query ?? ""));
        else if (path.StartsWith("/api/settings"))
            data = Encoding.UTF8.GetBytes(HandleSettings(ctx.Request.Url?.Query ?? ""));
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

    // ===== 世界状态：分层轮询 + 双数据源 + 陈旧缓存回退 =====
    // 裂缝（高频变化）：tenno.tools 快速端点，每 60 秒，几秒内可完成
    // 世界状态摘要（低频变化）：每 10 分钟，主源 warframestat.us（最全，偶发 Cloudflare 封锁），
    //                         备源 tenno.tools 完整端点（转换为兼容格式兜底）
    // 低频访问 warframestat.us（10 分钟一次）避免触发 403/429 限流
    private static readonly HttpClient _wsHttp = new()
    {
        Timeout = TimeSpan.FromSeconds(30),
        DefaultRequestHeaders = { { "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WarframeTool/1.0" } }
    };

    private static readonly object _wsLock = new();
    private static string _fissuresCoreRaw = "";   // 常规裂缝（tenno 快速端点，60 秒刷新）
    private static string _voidstormsRaw = "";     // 虚空风暴（完整端点提取，10 分钟刷新）
    private static string _wsSummaryRaw = "";      // 世界状态摘要（不含 ok/stale 包装）
    private static bool _wsStale;                   // 摘要刷新失败标记
    private static bool _fissuresStale;             // 裂缝刷新失败标记
    private static System.Threading.Timer? _fissureTimer;
    private static System.Threading.Timer? _wsTimer;

    // 启动分层后台轮询（立即在后台线程拉取，不阻塞主线程/窗口启动）
    public static void StartWorldStatePolling()
    {
        _fissureTimer = new System.Threading.Timer(_ => RefreshFissuresFast(), null,
            TimeSpan.Zero, TimeSpan.FromSeconds(60));
        _wsTimer = new System.Threading.Timer(_ => RefreshWorldState(), null,
            TimeSpan.Zero, TimeSpan.FromMinutes(10));
    }

    // 从根对象提取原始 JSON 文本（缺失时返回 null）
    private static string RawOrNull(JsonElement root, string key)
        => root.TryGetProperty(key, out var el) ? el.GetRawText() : "null";

    // 拉取指定数据源（失败返回 null）
    private static string? FetchSource(string url)
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
            return _wsHttp.GetStringAsync(url, cts.Token).Result;
        }
        catch { return null; }
    }

    // ---- 备源 tenno.tools → 主源格式转换 ----

    // 裂缝转换（tenno 格式）：stormsOnly=false 常规裂缝；true 虚空风暴（视为钢铁）
    private static string ConvertTennoFissures(JsonElement root, bool stormsOnly)
    {
        var sb = new StringBuilder("[");
        var first = true;
        void AddFissure(JsonElement f, bool isStorm)
        {
            if (!first) sb.Append(',');
            first = false;
            sb.Append("{\"id\":").Append(f.GetProperty("id").GetRawText())
              .Append(",\"node\":").Append(f.GetProperty("location").GetRawText())
              .Append(",\"enemy\":").Append(f.GetProperty("faction").GetRawText())
              .Append(",\"missionType\":").Append(f.GetProperty("missionType").GetRawText())
              .Append(",\"tier\":").Append(f.GetProperty("tier").GetRawText())
              .Append(",\"isStorm\":").Append(isStorm ? "true" : "false")
              .Append(",\"isHard\":").Append(f.TryGetProperty("hard", out var h) && h.GetBoolean() ? "true" : "false")
              .Append(",\"activation\":").Append(f.GetProperty("start").GetInt64())
              .Append(",\"expiry\":").Append(f.GetProperty("end").GetInt64())
              .Append('}');
        }
        if (!stormsOnly && root.TryGetProperty("fissures", out var fiss) && fiss.TryGetProperty("data", out var fd))
            foreach (var f in fd.EnumerateArray()) AddFissure(f, false);
        if (stormsOnly && root.TryGetProperty("voidstorms", out var storms) && storms.TryGetProperty("data", out var sd))
            foreach (var f in sd.EnumerateArray()) AddFissure(f, true);
        sb.Append(']');
        return sb.ToString();
    }

    // 环境周期：本地计算当前状态与下次切换时间
    // tenno 格式 {id, start, length, dayStart, dayEnd} → {state, expiry}
    private static string CycleJson(JsonElement c, string dayState, string nightState)
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        double start = c.GetProperty("start").GetDouble();
        double length = c.GetProperty("length").GetDouble();
        double dayStart = c.GetProperty("dayStart").GetDouble();
        double dayEnd = c.GetProperty("dayEnd").GetDouble();
        double phase = (now - start) % length;
        if (phase < 0) phase += length;
        bool isDay = phase >= dayStart && phase < dayEnd;
        double remain = isDay
            ? dayEnd - phase
            : (phase < dayStart ? dayStart - phase : length - phase + dayStart);
        return $"{{\"state\":\"{(isDay ? dayState : nightState)}\",\"expiry\":{now + (long)remain}}}";
    }

    // 地球周期：官方为 4h 白天 + 4h 夜晚，锚定 UTC 整点（00:00/08:00/16:00 UTC 起 白天）
    // tenno.tools 的 earth 数据误用平原 150 分钟周期，故本地按官方规律计算
    private static string EarthCycleJson()
    {
        var now = DateTime.UtcNow;
        bool isDay = (now.Hour % 8) < 4;
        var nextSwitch = now.Date.AddHours((now.Hour / 4 + 1) * 4);
        long expiry = new DateTimeOffset(nextSwitch, TimeSpan.Zero).ToUnixTimeSeconds();
        return $"{{\"state\":\"{(isDay ? "day" : "night")}\",\"expiry\":{expiry}}}";
    }

    // 世界状态摘要：周期（本地计算）+ 商人 + 突击（tenno 格式转换）+ 执政官（tenno 无此数据）
    // 自 Update 38.5 起，地球节点昼夜与夜灵平原（Cetus）同步（100min昼/50min夜）；
    // 火卫二魔胎之阈 Fass/Vome 周期也与平原同步（Fass=昼=混乱，Vome=夜=秩序）。
    // 故 earthCycle / cetusCycle / cambionCycle 均由 cetus 数据推导，保证三者一致。
    private static string ConvertTennoSummary(JsonElement root)
    {
        var sb = new StringBuilder();
        JsonElement? cetus = null;
        JsonElement? fortuna = null;
        if (root.TryGetProperty("daynight", out var dn) && dn.TryGetProperty("data", out var cycles))
        {
            foreach (var c in cycles.EnumerateArray())
            {
                var id = c.GetProperty("id").GetString();
                if (id == "cetus") cetus = c;
                else if (id == "fortuna") fortuna = c;
            }
        }

        if (cetus.HasValue)
        {
            var c = cetus.Value;
            sb.Append(",\"earthCycle\":").Append(CycleJson(c, "day", "night"));
            sb.Append(",\"cetusCycle\":").Append(CycleJson(c, "day", "night"));
            sb.Append(",\"cambionCycle\":").Append(CycleJson(c, "fass", "vome"));
        }
        else
        {
            sb.Append(",\"earthCycle\":null,\"cetusCycle\":null,\"cambionCycle\":null");
        }

        if (fortuna.HasValue)
            sb.Append(",\"vallisCycle\":").Append(CycleJson(fortuna.Value, "warm", "cold"));
        else
            sb.Append(",\"vallisCycle\":null");

        sb.Append(",\"zarimanCycle\":null,\"duviriCycle\":null");

        // 虚空商人 {start, end, name, location, active} → {activation, expiry, character, location}
        if (root.TryGetProperty("voidtraders", out var vtRoot) && vtRoot.TryGetProperty("data", out var vts)
            && vts.GetArrayLength() > 0)
        {
            var vt = vts[0];
            sb.Append(",\"voidTrader\":{\"activation\":").Append(vt.GetProperty("start").GetInt64())
              .Append(",\"expiry\":").Append(vt.GetProperty("end").GetInt64())
              .Append(",\"character\":").Append(vt.GetProperty("name").GetRawText())
              .Append(",\"location\":").Append(vt.GetProperty("location").GetRawText())
              .Append('}');
        }
        else sb.Append(",\"voidTrader\":null");

        // 突击 {bossName, faction, missions[{missionType, modifier, location}]} → {boss, faction, variants[{missionType, modifier, node}], expiry}
        if (root.TryGetProperty("sorties", out var soRoot) && soRoot.TryGetProperty("data", out var sos)
            && sos.GetArrayLength() > 0)
        {
            var so = sos[0];
            sb.Append(",\"sortie\":{\"boss\":").Append(so.GetProperty("bossName").GetRawText())
              .Append(",\"faction\":").Append(so.GetProperty("faction").GetRawText())
              .Append(",\"variants\":[");
            if (so.TryGetProperty("missions", out var ms))
            {
                var firstM = true;
                foreach (var m in ms.EnumerateArray())
                {
                    if (!firstM) sb.Append(',');
                    firstM = false;
                    sb.Append("{\"missionType\":").Append(m.GetProperty("missionType").GetRawText())
                      .Append(",\"modifier\":").Append(m.GetProperty("modifier").GetRawText())
                      .Append(",\"node\":").Append(m.GetProperty("location").GetRawText())
                      .Append('}');
                }
            }
            sb.Append("],\"expiry\":").Append(so.GetProperty("end").GetInt64()).Append('}');
        }
        else sb.Append(",\"sortie\":null");

        sb.Append(",\"archonHunt\":null,\"steelPath\":null"); // tenno.tools 不提供
        return sb.ToString();
    }

    // ---- 裂缝快速刷新（60 秒）：tenno.tools 快速端点，仅 ~4KB，秒级完成 ----
    private static void RefreshFissuresFast()
    {
        try
        {
            var json = FetchSource("https://api.tenno.tools/worldstate/pc/fissures");
            if (json != null)
            {
                using var doc = JsonDocument.Parse(json);
                var core = ConvertTennoFissures(doc.RootElement, stormsOnly: false);
                lock (_wsLock)
                {
                    _fissuresCoreRaw = core;
                    _fissuresStale = false;
                }
                return;
            }
            lock (_wsLock) { _fissuresStale = true; }
        }
        catch { lock (_wsLock) { _fissuresStale = true; } }
    }

    // 从主源 fissures 数组提取虚空风暴条目（isStorm=true，原样保留）
    private static string ExtractStormsFromWs(JsonElement root)
    {
        if (!root.TryGetProperty("fissures", out var fissures) || fissures.ValueKind != JsonValueKind.Array)
            return "[]";
        var sb = new StringBuilder("[");
        var first = true;
        foreach (var f in fissures.EnumerateArray())
        {
            if (!f.TryGetProperty("isStorm", out var isStorm) || !isStorm.GetBoolean()) continue;
            if (!first) sb.Append(',');
            first = false;
            sb.Append(f.GetRawText());
        }
        sb.Append(']');
        return sb.ToString();
    }

    // ---- 世界状态摘要 + 虚空风暴（低频 10 分钟）：主源 warframestat.us（最全）→ 备源 tenno.tools ----
    // 低频访问主源（10 分钟一次）避免触发 Cloudflare 403/429 限流
    private static void RefreshWorldState()
    {
        LoadArbiLeaderboard(); // 同步刷新仲裁生息效率评级（独立数据源，失败不影响下方流程）

        try
        {
            // ---- 主源：warframestat.us（一次请求覆盖全部数据，直接透传）----
            var json = FetchSource("https://api.warframestat.us/pc");
            if (json != null)
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                var sb = new StringBuilder();
                // 地球节点昼夜自 Update38.5 起与夜灵平原同步；火卫二 Fass/Vome 也与平原同步。
                // 强制 earthCycle=cetusCycle，cambionCycle 由 cetus state 映射（day→fass, night→vome），保证三者一致。
                var cetusRaw = RawOrNull(root, "cetusCycle");
                sb.Append(",\"earthCycle\":").Append(cetusRaw);
                sb.Append(",\"cetusCycle\":").Append(cetusRaw);
                sb.Append(",\"vallisCycle\":").Append(RawOrNull(root, "vallisCycle"));
                if (root.TryGetProperty("cetusCycle", out var cetusEl) && cetusEl.ValueKind == JsonValueKind.Object
                    && cetusEl.TryGetProperty("state", out var csEl) && cetusEl.TryGetProperty("expiry", out var ceEl))
                {
                    var st = csEl.GetString();
                    var cambionState = st == "day" ? "fass" : "vome";
                    sb.Append(",\"cambionCycle\":{\"state\":\"").Append(cambionState).Append("\",\"expiry\":").Append(ceEl.GetInt64()).Append("}");
                }
                else
                {
                    sb.Append(",\"cambionCycle\":null");
                }
                sb.Append(",\"zarimanCycle\":").Append(RawOrNull(root, "zarimanCycle"));
                sb.Append(",\"duviriCycle\":").Append(RawOrNull(root, "duviriCycle"));
                sb.Append(",\"voidTrader\":").Append(RawOrNull(root, "voidTrader"));
                sb.Append(",\"sortie\":").Append(RawOrNull(root, "sortie"));
                sb.Append(",\"archonHunt\":").Append(RawOrNull(root, "archonHunt"));
                sb.Append(",\"steelPath\":").Append(RawOrNull(root, "steelPath"));

                lock (_wsLock)
                {
                    _wsSummaryRaw = sb.ToString();
                    _voidstormsRaw = ExtractStormsFromWs(root);
                    _wsStale = false;
                }
                return;
            }

            // ---- 备源：tenno.tools 完整端点（转换为与主源兼容的格式）----
            var tennoJson = FetchSource("https://api.tenno.tools/worldstate/pc");
            if (tennoJson != null)
            {
                using var doc = JsonDocument.Parse(tennoJson);
                var root = doc.RootElement;
                var summary = ConvertTennoSummary(root);
                var storms = ConvertTennoFissures(root, stormsOnly: true);
                lock (_wsLock)
                {
                    _wsSummaryRaw = summary;
                    _voidstormsRaw = storms;
                    _wsStale = false;
                }
                return;
            }

            // 两个源都失败：保留旧数据并标记 stale（前端提示"数据刷新中"）
            lock (_wsLock) { _wsStale = true; }
        }
        catch
        {
            lock (_wsLock) { _wsStale = true; }
        }
    }

    // 前端请求时直接返回缓存（零 HTTP 调用，不阻塞）：常规裂缝 + 虚空风暴拼接
    private static string GetFissures()
    {
        lock (_wsLock)
        {
            var core = _fissuresCoreRaw.Length > 0 ? _fissuresCoreRaw : "[]";
            var storms = _voidstormsRaw.Length > 0 ? _voidstormsRaw.Trim('[', ']') : "";
            var merged = storms.Length > 0 ? core.TrimEnd(']') + "," + storms + "]" : core;
            return "{\"ok\":true,\"data\":" + merged + ",\"stale\":" + (_fissuresStale ? "true" : "false") + "}";
        }
    }

    private static string GetWorldState()
    {
        lock (_wsLock)
        {
            if (_wsSummaryRaw.Length > 0)
                return "{\"ok\":true,\"stale\":" + (_wsStale ? "true" : "false") + _wsSummaryRaw + "}";
        }
        return "{\"ok\":true,\"stale\":true}";
    }

    // ---- 仲裁评级（arbi.wf.wiki leaderboard）----
    // 每任务类型取 perHour 最高记录的评级 grade（效率数值不再使用排行榜，改用 arbi.guide 期望数据）
    private static Dictionary<string, string> _arbiLevel = new();

    // ---- 期望生息效率（arbi.guide 数据：每小时精炼精华 VE 期望区间，按地图节点）----
    // 仅 arbi.guide 收录的任务类型有数据（生存/防御/拦截/挖掘/中断），未收录任务不显示期望效率
    private static readonly Dictionary<string, (int low, int high)> ExpectedVe = new(StringComparer.OrdinalIgnoreCase)
    {
        // 挖掘
        ["Callisto"] = (800, 1000), ["Sinai"] = (400, 500), ["Io"] = (400, 500),
        ["Umbriel"] = (400, 700), ["Stephano"] = (450, 550), ["Alator"] = (800, 1000),
        // 拦截
        ["Cytherean"] = (800, 1000), ["Xini"] = (800, 1000), ["Mithra"] = (600, 750), ["Berehynia"] = (200, 400),
        // 防御
        ["Gulliver"] = (400, 500), ["Romula"] = (400, 500), ["Proteus"] = (400, 500),
        ["Casta"] = (450, 550), ["Seimeni"] = (450, 550), ["Hydron"] = (400, 550), ["Helene"] = (400, 550),
        ["Paimon"] = (450, 550), ["Larzac"] = (450, 550), ["Akkad"] = (450, 550), ["Kala-Azar"] = (450, 550),
        ["Coba"] = (400, 550), ["Lith"] = (400, 550), ["Hyf"] = (450, 600), ["Stöfler"] = (400, 500),
        // 生存
        ["Kadesh"] = (450, 550), ["Spear"] = (450, 550), ["Taranis"] = (450, 550), ["Belenus"] = (450, 550),
        ["Cinxia"] = (600, 800), ["Odin"] = (500, 700), ["Sechura"] = (450, 550), ["Tessera"] = (450, 550),
        ["Outer Terminus"] = (450, 550), ["Cerberus"] = (450, 550), ["Rhea"] = (550, 625),
        ["Larez"] = (550, 625), ["Larezzz"] = (550, 625), ["Sangeru"] = (550, 625), ["Gaia"] = (400, 500),
        // 中断
        ["Tyana Pass"] = (700, 1000), ["Munio"] = (600, 900), ["Ose"] = (600, 800), ["Oestrus"] = (500, 700),
    };

    // 中文任务名（leaderboard）→ 英文（本地仲裁时间表 MissionTypeMap）
    private static readonly Dictionary<string, string> MissionZhEn = new()
    {
        ["生存"] = "Survival",
        ["防御"] = "Defense",
        ["拦截"] = "Interception",
        ["中断"] = "Disruption",
        ["镜像防御"] = "Mirror Defense",
        ["挖掘"] = "Excavation",
        ["叛逃"] = "Defection",
        ["虚空洪流"] = "Void Flood",
        ["虚空决战"] = "Void Armageddon",
        ["元素转换"] = "Alchemy",
        ["INFESTED 资源回收"] = "Infested Salvage",
    };

    // 评级 → 等级：S=传奇，A系=优秀，其余/无数据=普通
    private static string GradeToLevel(string? grade) => grade switch
    {
        "S" => "legendary",
        "A+" or "A" or "A-" => "excellent",
        _ => "common"
    };

    // 拉取 leaderboard 两页（共 75 行），按任务类型聚合出最高 perHour 记录的评级 grade
    private static void LoadArbiLeaderboard()
    {
        try
        {
            // best[任务中文名] = (perHour, grade)（取 perHour 最高纪录的评级）
            var best = new Dictionary<string, (double perHour, string? grade)>(StringComparer.Ordinal);
            foreach (var url in new[]
            {
                "https://arbi.wf.wiki/api/leaderboard",
                "https://arbi.wf.wiki/api/leaderboard?page=2"
            })
            {
                var json = FetchSource(url);
                if (json == null) continue;
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                // 响应为 {"rows":[...],"total":n} 包装格式（兼容裸数组）
                var arr = root.ValueKind == JsonValueKind.Array ? root
                    : root.TryGetProperty("rows", out var rowsEl) ? rowsEl
                    : default;
                if (arr.ValueKind != JsonValueKind.Array) continue;
                foreach (var r in arr.EnumerateArray())
                {
                    var missionZh = r.TryGetProperty("missionType", out var mt) ? mt.GetString() : null;
                    if (string.IsNullOrEmpty(missionZh)) continue;
                    if (!r.TryGetProperty("perHour", out var ph) || ph.ValueKind != JsonValueKind.Number) continue;
                    var perHour = ph.GetDouble();
                    var grade = r.TryGetProperty("grade", out var g) ? g.GetString() : null;
                    if (!best.TryGetValue(missionZh, out var cur) || perHour > cur.perHour)
                        best[missionZh] = (perHour, grade);
                }
            }
            if (best.Count == 0) return; // 拉取失败时保留旧评级

            // 转换为英文任务名键（引用替换，线程安全）
            var lv = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var (missionZh, (_, grade)) in best)
            {
                if (!MissionZhEn.TryGetValue(missionZh, out var en)) continue;
                lv[en] = GradeToLevel(grade);
            }
            _arbiLevel = lv;
        }
        catch { /* 失败时保留旧评级 */ }
    }

    private static string GetArbitrations()
    {
        if (_arbysNodeList == null || _arbysSeq == null || _arbysNodeMeta == null)
            return JsonSerializer.Serialize(new { ok = false, error = "数据未加载" });

        var nowTs = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var todayStart = new DateTimeOffset(DateTime.Now.Date).ToUnixTimeSeconds(); // 本地日界 0 点（原按 UTC 切分会丢当天凌晨 8 小时）
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

            string node = nodeKey, missionType = "Unknown", faction = "Unknown", nameZh = "";
            if (_arbysNodeMeta.TryGetValue(nodeKey, out var meta))
            {
                var mtCode = meta.TryGetProperty("missionType", out var mt) ? mt.GetString() ?? "" : "";
                missionType = MissionTypeMap.TryGetValue(mtCode, out var mtEn) ? mtEn
                    : (meta.TryGetProperty("missionNameZh", out var mtZh) ? mtZh.GetString() ?? "Unknown" : "Unknown");

                var fcCode = meta.TryGetProperty("faction", out var fc) ? fc.GetString() ?? "" : "";
                faction = FactionMap.TryGetValue(fcCode, out var fcEn) ? fcEn
                    : (meta.TryGetProperty("factionNameZh", out var fcZh) ? fcZh.GetString() ?? "Unknown" : "Unknown");

                nameZh = meta.TryGetProperty("nameZh", out var nz) ? nz.GetString() ?? "" : "";
                var sysZh = meta.TryGetProperty("systemNameZh", out var sz) ? sz.GetString() ?? "" : "";
                node = string.IsNullOrEmpty(sysZh) ? (string.IsNullOrEmpty(nameZh) ? nodeKey : nameZh) : $"{nameZh} ({sysZh})";
            }

            // 评级（arbi.wf.wiki leaderboard grade，无数据默认普通）
            // 期望效率（arbi.guide：按地图节点的每小时精炼精华期望区间，未收录则不显示）
            string level = _arbiLevel.TryGetValue(missionType, out var lv2) ? lv2 : "common";
            int? effLow = null, effHigh = null;
            if (!string.IsNullOrEmpty(nameZh) && ExpectedVe.TryGetValue(nameZh, out var ve))
            {
                effLow = ve.low;
                effHigh = ve.high;
            }

            result.Add(new
            {
                start = startTs,
                end = startTs + _arbysStepSec,
                nodeKey = nodeKey,
                node = node,
                missionType = missionType,
                faction = faction,
                level = level,
                effLow = effLow,
                effHigh = effHigh,
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

    // 处理设置请求
    private static string HandleSettings(string query)
    {
        // 解析 ?closeBehavior=exit|tray
        foreach (var pair in query.TrimStart('?').Split('&'))
        {
            var eq = pair.IndexOf('=');
            if (eq <= 0) continue;
            var key = pair.Substring(0, eq);
            var val = Uri.UnescapeDataString(pair.Substring(eq + 1));
            if (key == "closeBehavior" && (val == "exit" || val == "tray"))
            {
                CloseBehavior = val;
                SaveSettings();
            }
        }
        return JsonSerializer.Serialize(new { ok = true, closeBehavior = CloseBehavior });
    }

    // 加载设置
    public static void LoadSettings()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                var json = File.ReadAllText(SettingsPath);
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("closeBehavior", out var cb))
                    CloseBehavior = cb.GetString() ?? "exit";
            }
        }
        catch { /* 忽略读取错误，使用默认值 */ }
    }

    // 保存设置
    private static void SaveSettings()
    {
        try
        {
            var dir = Path.GetDirectoryName(SettingsPath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            File.WriteAllText(SettingsPath,
                JsonSerializer.Serialize(new { closeBehavior = CloseBehavior }));
        }
        catch { /* 忽略保存错误 */ }
    }
}
