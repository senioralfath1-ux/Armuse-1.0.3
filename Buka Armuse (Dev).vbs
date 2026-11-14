' Menjalankan "npm run dev" di folder project Armuse tanpa menampilkan jendela CMD.
Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c npm run dev", 0, False
