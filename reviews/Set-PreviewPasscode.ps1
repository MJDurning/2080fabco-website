# Open a private Windows dialog. Save only the SHA-256 verifier beside the repo.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$runtime = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'reviews-preview-runtime'
$verifier = Join-Path $runtime 'preview-admin-passcode.sha256'
$legacy = Join-Path $runtime 'preview-admin-passcode.txt'
[System.IO.Directory]::CreateDirectory($runtime) | Out-Null

function Get-PasscodeVerifier([string]$Value) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    try { return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() }
    finally {
        [Array]::Clear($bytes, 0, $bytes.Length)
        $sha.Dispose()
    }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = '2080 Fab Co. Review Admin'
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ClientSize = New-Object System.Drawing.Size(510, 258)
$form.TopMost = $true

function Add-Label([string]$Text, [int]$Top) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Text
    $label.SetBounds(20, $Top, 470, 27)
    $form.Controls.Add($label)
    return $label
}

function Add-PasswordBox([int]$Top) {
    $box = New-Object System.Windows.Forms.TextBox
    $box.UseSystemPasswordChar = $true
    $box.MaxLength = 128
    $box.SetBounds(20, $Top, 470, 27)
    $form.Controls.Add($box)
    return $box
}

$null = Add-Label 'Choose your own preview passcode.' 18
$null = Add-Label 'New passcode' 53
$passcode = Add-PasswordBox 76
$null = Add-Label 'Confirm passcode' 108
$confirmation = Add-PasswordBox 131

$status = Add-Label '' 164
$status.ForeColor = [System.Drawing.Color]::Firebrick
$status.Height = 45

$save = New-Object System.Windows.Forms.Button
$save.Text = 'Save Passcode'
$save.SetBounds(250, 213, 133, 32)
$form.Controls.Add($save)
$form.AcceptButton = $save

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = 'Cancel'
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$cancel.SetBounds(392, 213, 98, 32)
$form.Controls.Add($cancel)
$form.CancelButton = $cancel

$save.Add_Click({
    $value = $passcode.Text
    if ($value.Length -eq 0) {
        $status.Text = 'Enter a passcode.'
        return
    }
    if ($value -cne $confirmation.Text) {
        $status.Text = 'The two entries do not match.'
        return
    }
    $next = Get-PasscodeVerifier $value
    $previous = if ([System.IO.File]::Exists($verifier)) {
        [System.IO.File]::ReadAllText($verifier).Trim()
    } elseif ([System.IO.File]::Exists($legacy)) {
        Get-PasscodeVerifier ([System.IO.File]::ReadAllText($legacy).Trim())
    }
    if ($next -ceq $previous) {
        $status.Text = 'Choose a different passcode.'
        return
    }
    $temporary = Join-Path $runtime ('passcode-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        [System.IO.File]::WriteAllText($temporary, $next + [Environment]::NewLine)
        if ([System.IO.File]::Exists($verifier)) {
            [System.IO.File]::Replace($temporary, $verifier, $null)
        } else {
            [System.IO.File]::Move($temporary, $verifier)
        }
    } catch {
        $status.Text = 'The private verifier could not be saved. Try again.'
        return
    } finally {
        if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) }
    }
    $passcode.Clear()
    $confirmation.Clear()
    $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Close()
})

try { $null = $form.ShowDialog() }
finally {
    $passcode.Clear()
    $confirmation.Clear()
    $form.Dispose()
}
