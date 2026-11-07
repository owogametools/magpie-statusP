//go:build windows

package agents

import (
	"os/exec"
	"syscall"
)

// hide keeps the CLI's console window from flashing when the app starts it.
func hide(cmd *exec.Cmd) {
	const createNoWindow = 0x08000000
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
}
