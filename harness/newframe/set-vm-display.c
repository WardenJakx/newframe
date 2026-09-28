#include <CoreGraphics/CoreGraphics.h>
#include <stdio.h>

int main(void) {
  CGDirectDisplayID display = CGMainDisplayID();
  CFArrayRef modes = CGDisplayCopyAllDisplayModes(display, NULL);
  if (modes == NULL) {
    fputs("Could not read VM display modes\n", stderr);
    return 1;
  }

  for (CFIndex index = 0; index < CFArrayGetCount(modes); index++) {
    CGDisplayModeRef mode = (CGDisplayModeRef)CFArrayGetValueAtIndex(modes, index);
    if (CGDisplayModeGetWidth(mode) != 1440 || CGDisplayModeGetHeight(mode) != 900) {
      continue;
    }

    CGDisplayConfigRef config;
    CGError result = CGBeginDisplayConfiguration(&config);
    if (result == kCGErrorSuccess) {
      result = CGConfigureDisplayWithDisplayMode(config, display, mode, NULL);
      if (result == kCGErrorSuccess) {
        result = CGCompleteDisplayConfiguration(config, kCGConfigureForSession);
      } else {
        CGCancelDisplayConfiguration(config);
      }
    }
    CFRelease(modes);
    if (result != kCGErrorSuccess) {
      fprintf(stderr, "Could not set VM display mode: %d\n", result);
      return 1;
    }
    puts("VM display set to 1440x900");
    return 0;
  }

  CFRelease(modes);
  fputs("VM display mode 1440x900 is unavailable\n", stderr);
  return 1;
}
