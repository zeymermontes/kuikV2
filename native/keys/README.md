# Release signing (git-ignored)

`kuik-release.keystore` signs every Android release of Kuik and Kuik Terminal.
Android only installs an update signed with the SAME key, so losing this file
means starting over with a new package name. Back it up (password manager +
offline copy) together with `keystore.properties`.

Recreate the properties file on a new machine:

```
storeFile=../../keys/kuik-release.keystore
storePassword=…
keyAlias=kuik
keyPassword=…
```
