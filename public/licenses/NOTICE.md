# HEIC decoder notices

This application dynamically loads heic-to 1.5.2 (LGPL-3.0).
Source and build instructions: https://github.com/hoppergee/heic-to
License text: [heic-to-LICENSE.txt](heic-to-LICENSE.txt).

heic-to bundles libheif 1.22.2 and its HEVC decoder dependencies.
Corresponding upstream source and license notices:
- https://github.com/strukturag/libheif/tree/v1.22.2
- https://github.com/strukturag/libde265

No dependency source modifications were made. Install with npm ci and rebuild
with npm run build to replace the decoder. The gallery's own code remains MIT.
