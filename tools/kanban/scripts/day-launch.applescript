-- P1399 Phase C: open one Claude session in the founder's terminal (Ghostty) for Start fixing.
--
-- Called only by the board server, with execFile (no shell), as:
--   osascript day-launch.applescript <launcher> <prompt-file> <working-dir>
-- The prompt never travels as an argument: the launcher reads it from the file and deletes it.
-- A new tab in the front window when there is one, else a new window. The caller falls back to
-- copying the prompt if this script fails.

on run argv
	set launcherPath to item 1 of argv
	set promptFile to item 2 of argv
	set workDir to item 3 of argv
	tell application "Ghostty"
		set cfg to new surface configuration
		set initial working directory of cfg to workDir
		set command of cfg to (quoted form of launcherPath) & " " & (quoted form of promptFile)
		set wait after command of cfg to true
		activate
		try
			set w to front window
			new tab in w with configuration cfg
			return "tab"
		on error
			new window with configuration cfg
			return "window"
		end try
	end tell
end run
