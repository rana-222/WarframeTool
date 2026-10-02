using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

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
