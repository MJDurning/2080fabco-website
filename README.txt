2080 FABRICATIONS CO. WEBSITE — SIMPLE LAUNCH VERSION

To preview the site and review service together, use Node.js 24 and the
Miniflare bundled with Wrangler 4.156.0. From this folder run
node reviews/preview.mjs "<absolute path to miniflare/dist/src/index.js>"
and open http://127.0.0.1:8095/.

The preview starts on loopback. Its backend, data, and passcode verifier stay
in reviews-preview-runtime beside the repository. It is excluded from the site.
Sign in to Review Admin and select Change Preview Passcode to enter your own
passcode privately. The Windows dialog in reviews/Set-PreviewPasscode.ps1 also
accepts masked entry on this PC. Save your new passcode in your password manager.

Included:
- Real 2080 Fab Co. logo
- Real printer and shop photos
- Pergola, WLED, and Cyberbrick featured projects
- Online shop (shop.2080fabco.com) and social links
- Desktop and mobile layout

This is intentionally the simple launch version. Additional project pages
and the POD store are the next phases after this website is online.

PROJECT REVIEWS

Preview customer form
http://127.0.0.1:8095/#leave-a-review

Preview admin sign-in
http://127.0.0.1:8095/admin/

Every submission is saved as Pending. Read it in the admin and check for
contact details before publishing. If a review includes a photo, use its
private preview and choose Publish With Photo or Publish Without Photo.
Both approval choices require customer permission. The uploaded photo is
limited to 8 MB, resized to fit within 1200 by 1200 pixels, and converted
to WebP with metadata removed. Only the processed photo is stored.

Unpublish removes the review from the homepage on its next load and closes
the public photo URL immediately. The admin preview remains available.
These actions take effect in the database.

PRODUCTION SETUP AFTER MATTHEW'S APPROVAL

GitHub Pages continues to serve the public site. The existing 2080 Fab Co.
Cloudflare Workers account will host the review service and its owner sign-in.
The planned customer and admin addresses are
https://2080fabco.com/#leave-a-review
https://2080-project-reviews.2080fabco.workers.dev/admin/

Create a dedicated D1 database for the review service in that account. Set its
ID in reviews/wrangler.jsonc, apply all reviews/migrations SQL, and enable
the REVIEW_IMAGES binding in the same Worker. Configure the Worker secret
ADMIN_PASSWORD_SHA256 with the lower-case hex SHA-256 digest of a separate
high-entropy production passcode. Save that passcode in Matthew's password
manager. The passcode change form and Windows helper are for the preview.
Deploy the Worker and verify its URL, CORS for the site, and private admin
sign-in before publishing the GitHub Pages update. The public endpoint is
configured on the Project Reviews section in index.html.
