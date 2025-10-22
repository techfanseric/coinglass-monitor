#!/usr/bin/env python3
"""
Sound notification hook for Claude Code
Plays a sound notification when tasks complete
"""

import sys
import subprocess
import platform

def play_sound():
    """Play a system notification sound based on the platform"""
    try:
        system = platform.system().lower()

        if system == "darwin":  # macOS
            # Use afplay to play a system sound
            subprocess.run(["afplay", "/System/Library/Sounds/Glass.aiff"],
                         capture_output=True, check=False)
        elif system == "windows":
            # Use PowerShell to play a sound on Windows
            subprocess.run(["powershell", "-c", "(New-Object Media.SoundPlayer 'C:\\Windows\\Media\\notify.wav').PlaySync();"],
                         capture_output=True, check=False)
        elif system == "linux":
            # Try different Linux sound players
            for player in ["paplay", "aplay", "mpg123", "mplayer"]:
                try:
                    if player == "paplay":
                        subprocess.run([player, "/usr/share/sounds/freedesktop/stereo/complete.oga"],
                                     capture_output=True, check=True)
                    elif player == "aplay":
                        subprocess.run([player, "/usr/share/sounds/alsa/Front_Left.wav"],
                                     capture_output=True, check=True)
                    break
                except (subprocess.CalledProcessError, FileNotFoundError):
                    continue
        else:
            print(f"Unsupported platform: {system}")
            return False

        return True

    except Exception as e:
        print(f"Error playing sound: {e}")
        return False

def main():
    """Main hook function"""
    if len(sys.argv) > 1:
        # Pass any arguments to control behavior
        action = sys.argv[1]

        if action == "test":
            print("Testing sound notification...")
            success = play_sound()
            print("Sound played successfully!" if success else "Failed to play sound")
            return 0 if success else 1
        elif action == "enable":
            print("Sound notifications enabled")
            return 0
        elif action == "disable":
            print("Sound notifications disabled")
            return 0

    # Default behavior: play a notification sound
    play_sound()
    return 0

if __name__ == "__main__":
    sys.exit(main())