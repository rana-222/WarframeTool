using Microsoft.Web.WebView2.WinForms;

namespace WarframeTool;

public class MainForm : Form
{
    private readonly WebView2 _webView;

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
            Dock = DockStyle.Fill,
            Source = new Uri("about:blank")
        };
        Controls.Add(_webView);

        Load += async (_, _) => await InitializeWebView();
    }

    private async Task InitializeWebView()
    {
        try
        {
            // 等待 WebView2 内核初始化
            await _webView.EnsureCoreWebView2Async();
            _webView.CoreWebView2.Navigate("http://127.0.0.1:8765/");
        }
        catch (Exception ex)
        {
            // WebView2 初始化失败时提示用户，但不退出（服务仍在运行）
            var msg = "WebView2 运行时未安装，请先安装 Microsoft Edge WebView2 Runtime。\n\n" +
                      "下载地址：https://developer.microsoft.com/microsoft-edge/webview2/\n\n" +
                      $"错误信息：{ex.Message}\n\n" +
                      "你也可以在浏览器中打开 http://127.0.0.1:8765 使用本工具。";
            MessageBox.Show(msg, "运行环境缺失", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }
}
