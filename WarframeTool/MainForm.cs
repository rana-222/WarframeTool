using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Diagnostics;
using System.Text.Json;

namespace WarframeTool;

public class MainForm : Form
{
    private readonly WebView2 _webView;
    private WebView2? _wikiView;          // 第二 WebView：内嵌灰机 Wiki（真实浏览器，可通过其安全验证）
    private Panel? _wikiPanel;            // Wiki 层容器（顶部工具条 + WebView）
    private TextBox? _wikiSearchBox;
    private NotifyIcon? _trayIcon;
    private bool _isExiting;

    // 同进程多个 WebView2 控件必须共享同一 CoreWebView2Environment（相同用户数据文件夹），
    // 否则第二个控件初始化会抛异常
    private static CoreWebView2Environment? _sharedEnv;
    private static async Task<CoreWebView2Environment> GetSharedEnv()
        => _sharedEnv ??= await CoreWebView2Environment.CreateAsync();

    public MainForm()
    {
        Text = "Warframe 玩家工具";
        Width = 1280;
        Height = 800;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(900, 600);
        BackColor = Color.White;

        _webView = new WebView2
        {
            Dock = DockStyle.Fill
            // 注意：不要在此设置 Source——Source 会立即用默认环境触发初始化，
            // 与 Load 中传入的共享 CoreWebView2Environment 冲突导致初始化失败
        };
        Controls.Add(_webView);

        Load += async (_, _) => await InitializeWebView();
        FormClosing += MainForm_FormClosing;

        SetupTrayIcon();

        // 启动版本检测（异步，不阻塞窗口加载）
        Shown += async (_, _) => await CheckForUpdateAsync();
    }

    // ===== 启动版本检测：对比 GitHub 最新 Release 版本号，有新版时提示并自动更新 =====
    // GitHub API：https://api.github.com/repos/rana-222/WarframeTool/releases/latest → tag_name (如 V1.1.0)
    // 更新流程：下载 Release 中的 install.exe 到临时目录 → 启动安装器（--wait-pid 等待本进程退出）→ 退出 → 安装器覆盖安装并自动重启
    private async Task CheckForUpdateAsync()
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("WarframeTool");
            http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");

            var json = await http.GetStringAsync("https://api.github.com/repos/rana-222/WarframeTool/releases/latest");
            using var doc = JsonDocument.Parse(json);
            var remote = ParseLooseVersion(doc.RootElement.GetProperty("tag_name").GetString() ?? "");
            var local = Program.AppVersion;
            if (remote == null || remote <= local) return; // 无新版（仅远程更新时升级，不降级）

            // 查找 Release 中的 install.exe 资产
            string? assetUrl = null;
            if (doc.RootElement.TryGetProperty("assets", out var assets))
                foreach (var a in assets.EnumerateArray())
                    if ((a.GetProperty("name").GetString() ?? "") == "install.exe")
                        assetUrl = a.GetProperty("browser_download_url").GetString();
            if (string.IsNullOrEmpty(assetUrl)) return;

            var answer = MessageBox.Show(
                $"发现新版本 V{remote}（当前 V{local}）\n\n是否立即下载并安装更新？\n安装完成后程序将自动重启。",
                "软件更新", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button1);
            if (answer != DialogResult.Yes) return;

            // 下载安装包（约 100MB，带进度窗口）
            var installerPath = await DownloadUpdateAsync(assetUrl);

            // 启动安装器：等待本进程退出后再覆盖安装，随后退出本程序
            Process.Start(new ProcessStartInfo
            {
                FileName = installerPath,
                Arguments = $"--wait-pid={Environment.ProcessId}",
                UseShellExecute = true
            });
            ExitApp();
        }
        catch
        {
            // 版本检测/下载失败静默忽略，不影响正常使用
        }
    }

    // 下载更新包到临时目录，返回安装包路径（含进度窗口）
    private async Task<string> DownloadUpdateAsync(string url)
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), "WarframeToolUpdate");
        Directory.CreateDirectory(tmpDir);
        var dest = Path.Combine(tmpDir, "install.exe");

        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("WarframeTool");
        using var resp = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        resp.EnsureSuccessStatusCode();
        var total = resp.Content.Headers.ContentLength ?? -1;

        var prog = new Form
        {
            Text = "正在下载更新",
            Size = new Size(400, 130),
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false,
            MinimizeBox = false
        };
        var lbl = new Label { Text = "准备下载...", Left = 14, Top = 14, Width = 360 };
        var bar = new ProgressBar { Left = 14, Top = 48, Width = 356, Height = 24, Minimum = 0, Maximum = 100 };
        prog.Controls.Add(lbl);
        prog.Controls.Add(bar);
        prog.Show(this);

        try
        {
            using var src = await resp.Content.ReadAsStreamAsync();
            using var fs = new FileStream(dest, FileMode.Create, FileAccess.Write);
            var buf = new byte[81920];
            long received = 0;
            int read;
            while ((read = await src.ReadAsync(buf)) > 0)
            {
                await fs.WriteAsync(buf, 0, read);
                received += read;
                if (total > 0)
                {
                    var pct = (int)Math.Min(100, received * 100 / total);
                    if (bar.Value != pct)
                    {
                        bar.Value = pct;
                        lbl.Text = $"已下载 {received / 1048576.0:F1} MB / {total / 1048576.0:F1} MB";
                    }
                }
            }
        }
        finally
        {
            prog.Close();
        }
        return dest;
    }

    // 解析宽松版本号："V1.2.3" / "v1.2.3+abc" → 1.2.3
    private static Version? ParseLooseVersion(string s)
    {
        s = s.Trim().TrimStart('v', 'V');
        var plus = s.IndexOf('+');
        if (plus >= 0) s = s.Substring(0, plus);
        if (!Version.TryParse(s, out var v)) return null;
        return new Version(v.Major, v.Minor, Math.Max(v.Build, 0));
    }

    private void SetupTrayIcon()
    {
        _trayIcon = new NotifyIcon
        {
            Text = "Warframe 玩家工具",
            Icon = SystemIcons.Application,
            Visible = false
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add("显示主窗口", null, (_, _) => ShowMainWindow());
        menu.Items.Add("退出程序", null, (_, _) => ExitApp());
        _trayIcon.ContextMenuStrip = menu;

        _trayIcon.DoubleClick += (_, _) => ShowMainWindow();
    }

    private void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_isExiting) return;

        // 如果设置为最小化到托盘，则取消关闭并隐藏窗口
        if (Program.CloseBehavior == "tray")
        {
            e.Cancel = true;
            Hide();
            if (_trayIcon != null)
            {
                _trayIcon.Visible = true;
                _trayIcon.ShowBalloonTip(2000, "Warframe 玩家工具",
                    "程序已最小化到系统托盘，双击图标恢复窗口", ToolTipIcon.Info);
            }
        }
        else
        {
            ExitApp();
        }
    }

    private void ShowMainWindow()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
        if (_trayIcon != null) _trayIcon.Visible = false;
    }

    private void ExitApp()
    {
        _isExiting = true;
        if (_trayIcon != null)
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
        }
        Application.Exit();
    }

    private async Task InitializeWebView()
    {
        try
        {
            await _webView.EnsureCoreWebView2Async(await GetSharedEnv());
            _webView.CoreWebView2.Navigate("http://127.0.0.1:8765/");

            // 主界面 JS 通过 postMessage 请求显示/隐藏 Wiki 层
            _webView.CoreWebView2.WebMessageReceived += (s, e) =>
            {
                try
                {
                    var msg = e.TryGetWebMessageAsString();
                    if (msg == "show-wiki") ShowWikiLayer(true);
                    else if (msg == "hide-wiki") ShowWikiLayer(false);
                }
                catch { }
            };
        }
        catch (Exception ex)
        {
            var msg = "WebView2 运行时未安装，请先安装 Microsoft Edge WebView2 Runtime。\n\n" +
                      "下载地址：https://developer.microsoft.com/microsoft-edge/webview2/\n\n" +
                      $"错误信息：{ex.Message}\n\n" +
                      "你也可以在浏览器中打开 http://127.0.0.1:8765 使用本工具。";
            MessageBox.Show(msg, "运行环境缺失", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    // ===== Wiki 查找层：第二 WebView 直接访问灰机 Wiki（匿名只读浏览） =====
    private async void ShowWikiLayer(bool visible)
    {
        if (visible && _wikiPanel == null) await CreateWikiLayer();
        if (_wikiPanel != null)
        {
            _wikiPanel.Visible = visible;
            if (visible) _wikiPanel.BringToFront();
        }
    }

    private async Task CreateWikiLayer()
    {
        _wikiPanel = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Visible = false };

        // 顶部工具条：返回工具 | 搜索框 | 搜索按钮 | Wiki首页
        var bar = new Panel { Dock = DockStyle.Top, Height = 52, BackColor = ColorTranslator.FromHtml("#FBF4E3") };

        var backBtn = MakeFlatBtn("← 返回工具", 10, 10, 104);
        backBtn.Click += (_, _) =>
        {
            ShowWikiLayer(false);
            // 主界面切回主页标签
            _ = _webView.CoreWebView2.ExecuteScriptAsync("if(typeof switchMainTab==='function') switchMainTab('home');");
        };

        _wikiSearchBox = new TextBox
        {
            Left = 126, Top = 13, Width = 480, Font = new Font("Microsoft YaHei", 10.5F)
        };
        _wikiSearchBox.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Enter) WikiSearch();
        };

        var searchBtn = MakeFlatBtn("🔍 搜索", 618, 10, 84);
        searchBtn.Click += (_, _) => WikiSearch();

        var homeBtn = MakeFlatBtn("📖 Wiki 首页", 712, 10, 104);
        homeBtn.Click += (_, _) => _wikiView?.CoreWebView2?.Navigate("https://warframe.huijiwiki.com/");

        bar.Controls.AddRange([backBtn, _wikiSearchBox, searchBtn, homeBtn]);

        _wikiView = new WebView2 { Dock = DockStyle.Fill };
        _wikiPanel.Controls.Add(_wikiView);
        _wikiPanel.Controls.Add(bar);
        Controls.Add(_wikiPanel);

        await _wikiView.EnsureCoreWebView2Async(await GetSharedEnv());
        // MediaWiki 标准站内搜索（匿名 GET，只读）
        _wikiView.CoreWebView2.Navigate("https://warframe.huijiwiki.com/");
    }

    private void WikiSearch()
    {
        var q = _wikiSearchBox?.Text?.Trim();
        if (string.IsNullOrEmpty(q) || _wikiView?.CoreWebView2 == null) return;
        var url = "https://warframe.huijiwiki.com/index.php?search=" + Uri.EscapeDataString(q);
        _wikiView.CoreWebView2.Navigate(url);
    }

    private Button MakeFlatBtn(string text, int left, int top, int width)
    {
        return new Button
        {
            Text = text,
            Left = left, Top = top, Width = width, Height = 32,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.White,
            ForeColor = ColorTranslator.FromHtml("#1B1C30"),
            Font = new Font("Microsoft YaHei", 9.75F, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
    }
}
