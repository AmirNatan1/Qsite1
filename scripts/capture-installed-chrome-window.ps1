param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [Parameter(Mandatory = $true)]
  [int]$RemoteDebuggingPort,

  [switch]$RefreshZoomBubble,

  [switch]$EmitJson
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class InstalledChromeWindowCapture
{
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder value, int capacity);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extraInfo);

    private static void KeyChord(byte key)
    {
        const byte Control = 0x11;
        const uint KeyUp = 0x0002;
        keybd_event(Control, 0, 0, UIntPtr.Zero);
        keybd_event(key, 0, 0, UIntPtr.Zero);
        keybd_event(key, 0, KeyUp, UIntPtr.Zero);
        keybd_event(Control, 0, KeyUp, UIntPtr.Zero);
    }

    public static IntPtr LastWindowHandle { get; private set; }
    public static uint LastProcessId { get; private set; }

    public static string Capture(uint[] processIds, string outputPath, bool refreshZoomBubble)
    {
        SetProcessDPIAware();
        var allowed = new HashSet<uint>(processIds);
        IntPtr selected = IntPtr.Zero;
        RECT selectedRect = new RECT();
        long selectedArea = 0;
        string selectedTitle = "";
        uint selectedProcessId = 0;

        EnumWindows((hWnd, lParam) =>
        {
            if (!IsWindowVisible(hWnd)) return true;
            uint processId;
            GetWindowThreadProcessId(hWnd, out processId);
            if (!allowed.Contains(processId)) return true;
            var title = new StringBuilder(1024);
            GetWindowText(hWnd, title, title.Capacity);
            RECT rect;
            if (title.Length == 0 || !GetWindowRect(hWnd, out rect)) return true;
            long width = Math.Max(0, rect.Right - rect.Left);
            long height = Math.Max(0, rect.Bottom - rect.Top);
            long area = width * height;
            if (area > selectedArea)
            {
                selected = hWnd;
                selectedRect = rect;
                selectedArea = area;
                selectedTitle = title.ToString();
                selectedProcessId = processId;
            }
            return true;
        }, IntPtr.Zero);

        if (selected == IntPtr.Zero || selectedArea <= 0) throw new InvalidOperationException("No visible installed-Chrome window matched the remote-debugging process.");
        LastWindowHandle = selected;
        LastProcessId = selectedProcessId;
        ShowWindow(selected, 9);
        SetForegroundWindow(selected);
        if (refreshZoomBubble)
        {
            Thread.Sleep(120);
            KeyChord(0xBD);
            Thread.Sleep(90);
            KeyChord(0xBB);
            Thread.Sleep(140);
        }
        else
        {
            Thread.Sleep(450);
        }

        if (!GetWindowRect(selected, out selectedRect)) throw new InvalidOperationException("The restored installed-Chrome window bounds are unavailable.");

        int captureWidth = selectedRect.Right - selectedRect.Left;
        int captureHeight = selectedRect.Bottom - selectedRect.Top;
        using (var bitmap = new Bitmap(captureWidth, captureHeight, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.CopyFromScreen(selectedRect.Left, selectedRect.Top, 0, 0, new Size(captureWidth, captureHeight), CopyPixelOperation.SourceCopy);
            bitmap.Save(outputPath, ImageFormat.Png);
        }
        return selectedTitle;
    }
}
"@

$portToken = "--remote-debugging-port=$RemoteDebuggingPort"
$processIds = @(Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq "chrome.exe" -and $_.CommandLine -like "*$portToken*" } |
  ForEach-Object { [uint32]$_.ProcessId })

if ($processIds.Count -eq 0) {
  throw "No installed Google Chrome process uses remote-debugging port $RemoteDebuggingPort."
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$parent = [System.IO.Path]::GetDirectoryName($resolvedOutput)
if (-not [System.IO.Directory]::Exists($parent)) {
  throw "Screenshot parent directory does not exist."
}
if ([System.IO.File]::Exists($resolvedOutput)) {
  throw "Refusing to overwrite an installed-Chrome screenshot."
}

$title = [InstalledChromeWindowCapture]::Capture($processIds, $resolvedOutput, [bool]$RefreshZoomBubble)
if (-not [System.IO.File]::Exists($resolvedOutput)) {
  throw "Installed-Chrome window capture did not create the requested PNG."
}

$zoomElement = $null
$zoomLabel = $null
$zoomElementIsOffscreen = $null
$zoomElementBounds = $null
if ($RefreshZoomBubble) {
  $automationRoot = [System.Windows.Automation.AutomationElement]::FromHandle([InstalledChromeWindowCapture]::LastWindowHandle)
  if ($null -eq $automationRoot) {
    throw "The matched installed-Chrome window has no UI Automation root."
  }
  $zoomCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    "Zoom: 200%"
  )
  $zoomElement = $automationRoot.FindFirst(
    [System.Windows.Automation.TreeScope]::Descendants,
    $zoomCondition
  )
  if ($null -ne $zoomElement) {
    $zoomLabel = $zoomElement.Current.Name
    $zoomElementIsOffscreen = $zoomElement.Current.IsOffscreen
    $bounds = $zoomElement.Current.BoundingRectangle
    if (-not $zoomElementIsOffscreen -and $bounds.Width -gt 0 -and $bounds.Height -gt 0) {
      $zoomElementBounds = [ordered]@{
        left = $bounds.Left
        top = $bounds.Top
        right = $bounds.Right
        bottom = $bounds.Bottom
        width = $bounds.Width
        height = $bounds.Height
      }
    }
  }
  if ($zoomLabel -ne "Zoom: 200%" -or $zoomElementIsOffscreen -ne $false -or $null -eq $zoomElementBounds) {
    throw "The visible installed-Chrome UI Automation tree does not expose an onscreen, non-empty Zoom: 200% control."
  }
}

if ($EmitJson) {
  $result = [ordered]@{
    product = "Google Chrome"
    processName = "chrome.exe"
    processId = [InstalledChromeWindowCapture]::LastProcessId
    windowHandle = [InstalledChromeWindowCapture]::LastWindowHandle.ToInt64()
    visible = $true
    remoteDebuggingProcessMatched = $true
    title = $title
    chromeMenuVisible = $zoomLabel -eq "Zoom: 200%" -and $zoomElementIsOffscreen -eq $false -and $null -ne $zoomElementBounds
    zoomLabel = $zoomLabel
    zoomElementIsOffscreen = $zoomElementIsOffscreen
    zoomElementBounds = $zoomElementBounds
  }
  [Console]::Out.Write(($result | ConvertTo-Json -Compress))
}
else {
  [Console]::Out.Write($title)
}
