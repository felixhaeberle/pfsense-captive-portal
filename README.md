# :lock::door: [pfsense Captive Portal Login](https://doc.pfsense.org/index.php/Captive_Portal)
Awesome pfsense login pages template for your captive portal!

<img src="https://github.com/felixhaeberle/pfsense-captive-portal/blob/master/screens/screen-desktop.jpg" alt="screenshot image of desktop" width="400" />

Supports **latest version** of [pfsense 2.4.4](https://www.pfsense.org/download/).
The portal pages are using `$PORTAL_ACTION$` and `$PORTAL_REDIRURL$` to get data from the firewall backend.
Authentication requests are send with `POST` requests to the firewall.

The login sites are
- based on **google material** thinking,
- **full responsive** and
- **support all modern browsers**.

All pages have User/Password input written in HTML5 and inline css (in the `head` tag):

- :arrow_right: **Login Page**
- :arrow_left: **Logout Page** with Logout message
- :x: **Error Page** with Error message

This separations is provided and needed by pfsense backend, anyone who is familiar with captive portal and pfsense will know that. Feel free to set issues if you are not comfortable with that solution and if I can do better.

The main plus point of this solutions is the look and feel of the login screen based on a **google material** thinking.
Both background image and logo SVG can be changed as everything of the code.

## :earth_africa: Browsers support

| [<img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/edge/edge_48x48.png" alt="IE / Edge" width="24px" height="24px" />](http://godban.github.io/browsers-support-badges/)<br>IE / Edge | [<img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/firefox/firefox_48x48.png" alt="Firefox" width="24px" height="24px" />](http://godban.github.io/browsers-support-badges/)<br>Firefox | [<img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/chrome/chrome_48x48.png" alt="Chrome" width="24px" height="24px" />](http://godban.github.io/browsers-support-badges/)<br>Chrome | [<img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/safari/safari_48x48.png" alt="Safari" width="24px" height="24px" />](http://godban.github.io/browsers-support-badges/)<br>Safari | [<img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/safari-ios/safari-ios_48x48.png" alt="iOS Safari" width="24px" height="24px" />](http://godban.github.io/browsers-support-badges/)<br>iOS Safari | [<img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/samsung-internet/samsung-internet_48x48.png" alt="Samsung" width="24px" height="24px" />](http://godban.github.io/browsers-support-badges/)<br>Samsung | [<img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/opera/opera_48x48.png" alt="Opera" width="24px" height="24px" />](http://godban.github.io/browsers-support-badges/)<br>Opera |
| --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| IE9, IE10, IE11, Edge| last 5 versions| last 5 versions| last 5 versions| last 5 versions| last 5 versions| last 5 versions

## :link: A list of helpful links

- [Official Pfsense Captive Portal Documentation](https://doc.pfsense.org/index.php/Captive_Portal)
- [Official Pfsense Captive Portal Voucher Documentation](https://doc.pfsense.org/index.php/Captive_Portal_Vouchers)
- [German HowTo Pfsense Captive Portal](http://www.nwlab.net/tutorials/pfSense/Captive-Portal.html)

## :bird: Follow me
Please follow me on [Twitter](https://twitter.com/felix_haeberle) if you want to get updates about this pfsense captive portal and web development.
