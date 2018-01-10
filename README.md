# [pfsense Captive Portal Login](https://doc.pfsense.org/index.php/Captive_Portal)
Awesome pfsense login pages template for your captive portal!

Supports **latest version** of [pfsense 2.4.2](https://www.pfsense.org/download/).
The portal pages are using `$PORTAL_ACTION$` and `$PORTAL_REDIRURL$` to get data from the firewall backend.
Authentication requests are send with `POST` requests to the firewall.

The login sites are based on **google material** thinking, **full responsive** and **supports all modern browsers**.

![browser support svg](https://github.com/felixhaeberle/pfsense-captive-portal/blob/master/screens/support.svg)

All pages have User/Password input written in HTML5 and inline css (in the `head` tag):

- **Login Page**
- **Logout Page** with Logout message
- **Error Page** with Error message

This separations is provided and needed by pfsense backend, anyone who is familiar with captive portal and pfsense will know that. Feel free to set issues if you are not comfortable with that solution and if I can do better.

The main plus point of this solutions is the look and feel of the login screen based on a **google material** thinking.
Both background image and logo SVG can be changed as everything of the code.


![screenshot image of desktop](https://github.com/felixhaeberle/pfsense-captive-portal/blob/master/screens/screen-desktop.jpg)
