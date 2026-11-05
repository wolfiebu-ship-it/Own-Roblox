# Klotzwelt online stellen

Mit dieser Anleitung läuft Klotzwelt mit **Konten, Freunden, Gruppen und Mehrspieler** im Internet.
Du brauchst zwei kostenlose Dienste:

- **Neon** für die Datenbank (dort werden Konten, Freunde und gekaufte Sachen gespeichert)
- **Render** für den Server (er liefert das Spiel aus und verbindet die Spieler)

Beide kannst du mit deinem GitHub-Konto anlegen. Die Oberflächen der Anbieter ändern sich manchmal ein bisschen. Wenn ein Knopf anders heißt, such nach einem ähnlichen.

---

## Schritt 1: Datenbank bei Neon

1. Geh auf **neon.tech** und klick auf **Sign up**. Melde dich mit GitHub an.
2. Leg ein neues Projekt an:
   - Name: `klotzwelt`
   - Region: **Frankfurt** (AWS eu-central-1), weil die nah an Deutschland ist
3. Danach zeigt Neon eine **Connection string** an. Sie sieht ungefähr so aus:
   `postgresql://benutzer:passwort@ep-irgendwas.eu-central-1.aws.neon.tech/neondb?sslmode=require`
4. Kopier diese Zeile und heb sie gut auf. **Gib sie niemandem**, sie ist wie ein Passwort.

## Schritt 2: Server bei Render

1. Geh auf **render.com** und klick auf **Get Started**. Melde dich mit GitHub an.
2. Klick auf **New +** und dann auf **Web Service**.
3. Verbinde GitHub, falls Render fragt, und wähle das Repo **Own-Roblox** aus.
4. Fülle die Einstellungen so aus:

   | Feld | Eintrag |
   | --- | --- |
   | Name | `klotzwelt` (wird Teil der Adresse) |
   | Region | **Frankfurt (EU Central)** |
   | Branch | `etappe-2-online` (oder `master`, sobald alles dort zusammengeführt ist) |
   | Runtime / Language | **Node** |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |

5. Unter **Environment Variables** fügst du eine Variable hinzu:
   - Key: `DATABASE_URL`
   - Value: die Connection string von Neon aus Schritt 1
6. Unter **Advanced** kannst du bei **Health Check Path** `/health` eintragen (das ist freiwillig).
7. Klick auf **Create Web Service**.

Render baut jetzt den Server. Das dauert ein bis drei Minuten. Wenn oben **Live** steht, ist er fertig.
In den **Logs** sollte stehen:

```
Datenbank verbunden.
Klotzwelt läuft auf Port 10000
```

## Schritt 3: Ausprobieren

1. Öffne die Adresse, die Render oben anzeigt, zum Beispiel `https://klotzwelt.onrender.com`.
2. Geh auf den Tab **Freunde** und erstelle unter **Neues Konto** ein Konto.
3. Öffne die Adresse auf einem zweiten Gerät (oder in einem privaten Browserfenster), erstelle ein zweites Konto und schick dir gegenseitig eine Freundschaftsanfrage.
4. Gründe eine Gruppe, lade den Freund ein und starte ein Spiel: Der Freund kommt automatisch mit.

## Schritt 4: Aufs iPhone

1. Öffne die Render-Adresse in **Safari**.
2. Tippe auf **Teilen** und dann auf **Zum Home-Bildschirm**.

Jetzt startet Klotzwelt wie eine App.

---

## Gut zu wissen

- **Einschlafen:** Beim kostenlosen Render-Tarif schläft der Server ein, wenn 15 Minuten niemand spielt. Der erste Aufruf danach dauert bis zu einer Minute. Danach ist er wieder schnell. Mit einem bezahlten Tarif (ab etwa 7 US-Dollar im Monat) passiert das nicht.
- **Neue Versionen:** Jedes Mal, wenn neuer Code im gewählten Branch auf GitHub landet, baut Render den Server automatisch neu.
- **Ohne Datenbank:** Wenn `DATABASE_URL` fehlt, speichert der Server in einer Datei. Auf Render geht diese Datei bei jedem Neustart verloren, deshalb ist Neon wichtig.
- **Auf dem eigenen Computer testen:** Mit Node.js (Version 18 oder neuer):

  ```
  npm install
  npm start
  ```

  Dann `http://localhost:3000` im Browser öffnen.

## Website privat machen (Zugangscode)

Wenn bei Render die Umgebungsvariable `SITE_CODE` gesetzt ist, sieht jeder, der die Adresse öffnet, zuerst nur eine Seite mit „Diese Klotzwelt ist privat“. Erst mit dem richtigen Zugangscode kommt man rein. Das Gerät merkt sich den Code danach 6 Monate.

1. Bei Render deinen Service öffnen → **Environment** → **Add Environment Variable**
2. Key: `SITE_CODE`, Value: dein Zugangscode (ein Wort oder eine Zahl, die du deinen Freunden gibst)
3. **Save Changes**

Wer den Code ändert, sperrt alle aus, bis sie den neuen Code eingeben. Ohne `SITE_CODE` ist die Website wieder für alle offen.

## Erfinder-Code

Die Umgebungsvariable `CREATOR_CODE` legt den geheimen Code fest, mit dem ein angemeldetes Konto im Tab **Admin** zum Erfinder wird. Der Code steht nicht im Programm.

## Sicherheit

- Passwörter werden nur verschlüsselt (scrypt mit Salt) gespeichert.
- Benutzernamen gehen durch denselben Filter gegen Beleidigungen und unanständige Namen wie im Spiel, diesmal auf dem Server.
- Nach 8 falschen Passwörtern ist ein Konto 10 Minuten gesperrt. Von einer Adresse können höchstens 5 Konten pro Stunde erstellt werden.
- Das Geburtsjahr wird für die Altersgruppen gespeichert (unter 13, 13 bis 17, 18 und älter) und anderen nicht angezeigt. Es ist eine eigene Angabe und keine geprüfte Altersverifikation.
- Noch nicht auf dem Server: Münzen, Admins und Banns. Die liegen weiterhin auf dem jeweiligen Gerät und lassen sich dort verändern. Das ist der nächste Schritt.
