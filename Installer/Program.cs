using System.Diagnostics;
using System.Reflection;

namespace WarframeInstaller;

internal static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        // 解析 --wait-pid=N：自动更新场景下，旧版本进程启动安装器后自行退出，
        // 安装器需等待其完全退出（释放 exe 文件锁）再开始覆盖安装
        int waitPid = -1;
        foreach (var a in args)
        {
            if (a.StartsWith("--wait-pid="))
                int.TryParse(a.Substring("--wait-pid=".Length), out waitPid);
        }
        bool hasWait = waitPid > 0;

        var form = new Form
        {
            Text = "Warframe 玩家工具 - 安装程序",
            Size = new Size(420, 200),
            StartPosition = FormStartPosition.CenterScreen,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            BackColor = Color.White
        };

        var titleLabel = new Label
        {
            Text = "Warframe 玩家工具",
            Font = new Font("Microsoft YaHei", 16, FontStyle.Bold),
            Size = new Size(380, 35),
            Location = new Point(20, 15),
            TextAlign = ContentAlignment.MiddleCenter
        };
        form.Controls.Add(titleLabel);

        var statusLabel = new Label
        {
            Text = "正在安装...",
            Font = new Font("Microsoft YaHei", 10),
            Size = new Size(380, 25),
            Location = new Point(20, 65),
            TextAlign = ContentAlignment.MiddleCenter
        };
        form.Controls.Add(statusLabel);

        var progressBar = new ProgressBar
        {
            Size = new Size(360, 20),
            Location = new Point(20, 100),
            Style = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 30
        };
        form.Controls.Add(progressBar);

        var hintLabel = new Label
        {
            Text = "请稍候...",
            Font = new Font("Microsoft YaHei", 8),
            ForeColor = Color.Gray,
            Size = new Size(380, 20),
            Location = new Point(20, 130),
            TextAlign = ContentAlignment.MiddleCenter
        };
        form.Controls.Add(hintLabel);

        form.Shown += async (_, _) =>
        {
            try
            {
                // 自动更新：等待旧版本进程完全退出（最多 20 秒）再覆盖安装
                if (hasWait)
                {
                    statusLabel.Text = "等待旧版本退出...";
                    form.Refresh();
                    try { Process.GetProcessById(waitPid).WaitForExit(20000); } catch { }
                }

                statusLabel.Text = "正在解压主程序...";
                form.Refresh();

                // 安装到安装器所在目录的 version\V{版本号}\ 下
                var version = Assembly.GetExecutingAssembly().GetName().Version;
                var verStr = $"V{version.Major}.{version.Minor}.{version.Build}";
                var baseDir = Path.GetDirectoryName(Application.ExecutablePath)!;
                var installDir = Path.Combine(baseDir, "version", verStr);
                Directory.CreateDirectory(installDir);

                // 从嵌入资源提取主程序
                var asm = Assembly.GetExecutingAssembly();
                var resName = asm.GetManifestResourceNames().FirstOrDefault(n => n.EndsWith("WarframeTool.exe"));
                if (resName == null)
                {
                    MessageBox.Show("安装包损坏：找不到主程序资源", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    Application.Exit();
                    return;
                }
                using var resStream = asm.GetManifestResourceStream(resName);

                var exePath = Path.Combine(installDir, "WarframeTool.exe");
                using (var fs = new FileStream(exePath, FileMode.Create, FileAccess.Write))
                {
                    await resStream.CopyToAsync(fs);
                }

                statusLabel.Text = "正在检查运行环境...";
                form.Refresh();

                // 检查 WebView2 Runtime
                if (!IsWebView2Installed())
                {
                    statusLabel.Text = "正在安装 WebView2 运行时...";
                    form.Refresh();
                    InstallWebView2();
                }

                statusLabel.Text = "正在创建快捷方式...";
                form.Refresh();

                CreateShortcut(
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "Warframe 玩家工具.lnk"),
                    exePath, installDir);

                CreateShortcut(
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "Warframe 玩家工具.lnk"),
                    exePath, installDir);

                progressBar.Style = ProgressBarStyle.Continuous;
                progressBar.Value = 100;
                statusLabel.Text = "安装完成！";
                hintLabel.Text = "正在启动程序...";
                form.Refresh();

                await Task.Delay(800);

                // 启动程序
                Process.Start(new ProcessStartInfo
                {
                    FileName = exePath,
                    WorkingDirectory = installDir,
                    UseShellExecute = true
                });

                Application.Exit();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"安装失败：{ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Application.Exit();
            }
        };

        Application.Run(form);
    }

    static bool IsWebView2Installed()
    {
        try
        {
            var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                @"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}");
            return key != null;
        }
        catch { return false; }
    }

    static void InstallWebView2()
    {
        try
        {
            // 使用 Edge 自带的 WebView2 安装器（在线下载）
            var psi = new ProcessStartInfo
            {
                FileName = "msedgewebview2setup.exe",
                Arguments = "/silent /install",
                UseShellExecute = true,
                Verb = "runas"
            };
            var p = Process.Start(psi);
            p?.WaitForExit(60000);
        }
        catch
        {
            // 静默失败，用户可手动安装
        }
    }

    static void CreateShortcut(string shortcutPath, string targetPath, string workingDir)
    {
        try
        {
            var ps = $"$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('{shortcutPath}'); $sc.TargetPath = '{targetPath}'; $sc.WorkingDirectory = '{workingDir}'; $sc.Description = 'Warframe 玩家工具'; $sc.Save()";
            Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -Command \"{ps}\"",
                UseShellExecute = false,
                CreateNoWindow = true
            })?.WaitForExit(5000);
        }
        catch { /* 忽略快捷方式创建失败 */ }
    }
}
