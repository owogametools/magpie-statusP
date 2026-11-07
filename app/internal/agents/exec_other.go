//go:build !windows

package agents

import "os/exec"

func hide(cmd *exec.Cmd) {}
