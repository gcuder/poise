# poise — installer
#
# `make install` copies poise/ into each agent's skills dir:
#   - ~/.claude/skills/poise/      (Claude Code + OpenCode — OpenCode reads
#                                   .claude/skills/ natively)
#   - $CODEX_HOME/skills/poise/    (Codex; default ~/.codex/skills/)
#
# Codex must be RESTARTED after install or sync — it reloads skill metadata
# on launch only.

.PHONY: install sync install-check uninstall help _copy

SKILL_SRC   := $(CURDIR)/poise
CLAUDE_DEST := $(HOME)/.claude/skills/poise
CODEX_HOME  ?= $(HOME)/.codex
CODEX_DEST  := $(CODEX_HOME)/skills/poise

# Set FORCE=1 to clobber existing installs / skip confirmation prompts.
FORCE ?=

help:
	@echo "poise installer"
	@echo ""
	@echo "  make install         install into ~/.claude/skills/ and ~/.codex/skills/"
	@echo "                       (refuses to overwrite unless FORCE=1)"
	@echo "  make sync            re-copy after a git pull; clobbers without prompt"
	@echo "  make install-check   report status of each install dir"
	@echo "  make uninstall       remove both install dirs (prompts unless FORCE=1)"
	@echo ""
	@echo "Codex must be restarted after install or sync to reload skill metadata."

install:
	@for dest in $(CLAUDE_DEST) $(CODEX_DEST); do \
		if [ -e "$$dest" ] && [ -z "$(FORCE)" ]; then \
			echo "ERROR: $$dest already exists."; \
			echo "       Use 'make sync' to update an existing install,"; \
			echo "       or 'make install FORCE=1' to overwrite."; \
			exit 1; \
		fi; \
	done
	@$(MAKE) --no-print-directory _copy
	@echo "✓ Installed to $(CLAUDE_DEST) (Claude Code + OpenCode)"
	@echo "✓ Installed to $(CODEX_DEST) (Codex)"
	@echo ""
	@echo "Restart Codex to pick up the new skill (codex reloads on launch only)."

sync:
	@printf "Source:       %s\n\n" "$(SKILL_SRC)"
	@for entry in "Claude Code + OpenCode|$(CLAUDE_DEST)" "Codex|$(CODEX_DEST)"; do \
		label=$${entry%%|*}; \
		dest=$${entry##*|}; \
		if [ ! -e "$$dest" ]; then \
			printf "%s: installing fresh (no prior install at %s)\n" "$$label" "$$dest"; \
		else \
			diff_out=$$(diff -rq "$(SKILL_SRC)" "$$dest" 2>/dev/null); \
			if [ -z "$$diff_out" ]; then \
				printf "%s: already in sync\n" "$$label"; \
			else \
				printf "%s: changes to apply:\n" "$$label"; \
				echo "$$diff_out" | sed 's/^/  /'; \
			fi; \
		fi; \
	done
	@$(MAKE) --no-print-directory _copy
	@printf "\n✓ Synced to %s\n" "$(CLAUDE_DEST)"
	@printf "✓ Synced to %s\n\n" "$(CODEX_DEST)"
	@echo "Restart Codex to pick up the changes (codex reloads on launch only)."

install-check:
	@printf "Source:       %s\n\n" "$(SKILL_SRC)"
	@for entry in "Claude Code + OpenCode|$(CLAUDE_DEST)" "Codex|$(CODEX_DEST)"; do \
		label=$${entry%%|*}; \
		dest=$${entry##*|}; \
		printf "%s\n  %s\n" "$$label" "$$dest"; \
		if [ ! -e "$$dest" ]; then \
			printf "  status: missing\n\n"; \
			continue; \
		fi; \
		diff_out=$$(diff -rq "$(SKILL_SRC)" "$$dest" 2>/dev/null); \
		if [ -z "$$diff_out" ]; then \
			printf "  status: in sync\n\n"; \
		else \
			printf "  status: drifted\n"; \
			echo "$$diff_out" | sed 's/^/    /'; \
			printf "\n"; \
		fi; \
	done

uninstall:
	@if [ -z "$(FORCE)" ]; then \
		printf "Remove %s and %s? [y/N] " "$(CLAUDE_DEST)" "$(CODEX_DEST)"; \
		read ans; \
		case "$$ans" in \
			y|Y|yes|YES) ;; \
			*) echo "Aborted."; exit 1 ;; \
		esac; \
	fi
	@rm -rf "$(CLAUDE_DEST)" "$(CODEX_DEST)"
	@echo "✓ Removed $(CLAUDE_DEST)"
	@echo "✓ Removed $(CODEX_DEST)"

# Internal: replace each dest with a fresh copy of the source. Scoped to the
# `poise/` subdir of each skills/ dir — never touches anything else.
_copy:
	@mkdir -p "$(dir $(CLAUDE_DEST))" "$(dir $(CODEX_DEST))"
	@rm -rf "$(CLAUDE_DEST)" "$(CODEX_DEST)"
	@cp -R "$(SKILL_SRC)" "$(CLAUDE_DEST)"
	@cp -R "$(SKILL_SRC)" "$(CODEX_DEST)"
