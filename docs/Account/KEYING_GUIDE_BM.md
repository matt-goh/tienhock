# Panduan keying jurnal — baucar perbelanjaan (tunai/bank)

**Dicipta 6 Ogos 2026** daripada penyesuaian Jun 2026: setiap akaun di bawah ialah
akaun yang digunakan oleh program legasi, terbukti baris demi baris melalui
cetakan lejar legasi. Key kepada akaun ini sejak awal dan penyesuaian bulanan
(`dev/import/legacy-tieout/`) kekal pada perbezaan sifar — tiada pembetulan
diperlukan.

> **Dikemas kini 7 Ogos 2026.** Panduan ini diterbitkan daripada **cetakan** lejar
> Jun 2026. Dua baris dalam cetakan itu sebenarnya kesilapan keying dalam program
> legasi, bukan dalam ERP — rakan sekerja telah membetulkan kedua-duanya dalam
> program legasi (dan ERP) pada 7 Ogos 2026, dan panduan ini telah dibetulkan:
> **KFC → `MBSM_K`** (bukan `MBC`) dan **resit PAUMIN = `MBRMF` 565.00 + `MBSAF`
> 144.00** (bukan 465.00 / 244.00). Peraturan am: apabila cetakan legasi dan ERP
> tidak sepadan, sahkan dengan resit asal dahulu — cetakan bukan bukti muktamad.

## Lima peraturan

1. **Diesel kenderaan → akaun `OIL*` KENDIRI kenderaan itu.** Setiap resit
   diesel adalah untuk kenderaan tertentu — padankan nombor plat/kenderaan
   dengan akaun: `OIL6323` SAB6323H · `OIL920` Perodua Ativa QCV920 ·
   `OIL9698` SAB9698C · `OIL9882` Hilux SWJ9882 · `OIL9897` SAB9897R ·
   `OIL9922` SD9922H · `OILFORK` forklift · `OILHT15` Hitachi SAB9515M ·
   `OILHT18` Hitachi SAB9518M. Gunakan `OILOTH` hanya apabila kenderaan itu
   memang tiada akaun sendiri (Jun: resit SHELL untuk Ativa telah dikunci
   sebagai OILOTH — padahal ia ada `OIL920`).
2. **Bahagian/pembaikan kenderaan → akaun `R*` kenderaan itu, JANGAN SEKALI-
   KALI ke akaun `OIL*`.** `R9698` SAB9698C · `R9922` SD9922H · `RBFORK`
   bateri forklift · `ROTH` hanya untuk kenderaan yang tiada akaun sendiri.
   (Jun: seal dan busi untuk SAB9698C telah dikunci sebagai diesel `OIL9698`.)
3. **Bahagian mesin/premis — tanya "bahagian ini untuk APA?":**
   - Mesin BIHUN (termasuk barang habis guna: getah gred makanan, pita
     pembungkusan) → `BRM`
   - Mesin MEE → `MRM`
   - Bahagian mesin kongsi MEE+BIHUN → `MBRM`
   - Bangunan kilang / infrastruktur kongsi → `MBRMF`
   - Premis Menggatal → `MGT`
   Pembekal yang sama boleh jatuh ke akaun berbeza bergantung pada bahagian —
   galas KK BEARING NKI untuk mesin MEE → `MRM`, tetapi KK BEARING 6202 LLU
   untuk Menggatal → `MGT`. Baca nota "UNTUK …" pada resit.
4. **Makanan kakitangan → `MBSM_K` (kakitangan KILANG) atau `MBSM_O`
   (kakitangan PEJABAT)** — pilih mengikut SIAPA makanan itu, bukan tempat ia
   dibeli.
5. **Pecahkan resit mengikut item, dan jumlah pecahan mesti sama dengan jumlah
   resit.** Satu resit PAUMIN (#2606-2133) = cakera pemotong/mata gerudi/pita
   penebat `MBRMF` 565.00 + sarung tangan/cermin mata `MBSAF` 144.00 = 709.00.
   Kira setiap pecahan daripada item pada resit — jangan anggarkan.

## Jadual pembekal → akaun (terbukti melalui lejar legasi Jun 2026)

| Pembekal / resit | Akaun betul | Tersilap dikunci sebagai |
|---|---|---|
| TAOBAO-JING XIAN YOU (getah gred makanan BIHUN) | `BRM` | `MBOR` |
| TAOBAO-PIN SHANG MEI SHUO (pita pembungkusan BIHUN) | `BRM` | — |
| TAOBAO-SHUANG MEI HARDWARE (spring, mesin MEE) | `MRM` | `BRM` |
| TAOBAO-HU HAO FLAGSHIP (mata gerudi, mesin MEE) | `MRM` | — |
| TAOBAO-FOSHAN NAN FANG (bolt, mesin MEE) | `MRM` | — |
| TAOBAO-RUI QI GONG JU (mata gerudi, mesin MEE) | `MRM` | — |
| TAOBAO-ZHE JIANG SHEN HONG (spring, mesin MEE) | `MRM` | — |
| HV ELECTRICAL — MCB untuk papan agihan mesin MEE | `MRM` | — |
| HV ELECTRICAL — kabel kuprum (pendawaian kilang) | `MBRMF` | `MBRM` |
| STRIKER ELECTRIC (MCB/kontaktor, mesin MEE) | `MRM` | — |
| LASER TRADING (rod karbida, pisau kejuruteraan) | `MRM` | — |
| V.E ELECTRICAL (termogandingan, mesin MEE) | `MRM` | — |
| TAOBAO-BOZHEN (gris galas, mesin kongsi) | `MBRM` | — |
| TAOBAO-GU DE LI QI HANG (pistol angin pemampat) | `MBRM` | — |
| TAOBAO-HANG ZHOU JIN XIN (kotak gear RV63) | `MBRM` | — |
| PAUMIN HARDWARE — cakera pemotong (565.00 pada #2606-2133) | `MBRMF` | — |
| PAUMIN HARDWARE — sarung tangan/cermin mata (144.00 pada #2606-2133) | `MBSAF` | — |
| TAOBAO-WEI ER DUN (but keselamatan) | `MBSAF` | — |
| SESB (meter Menggatal) | `MGT` | — |
| 168 HARDWARE (Menggatal) | `MGT` | — |
| BUILDERS EMPORIUM (plumbing/paip Menggatal) | `MGT` | — |
| TAOBAO-ZHI CHENG ZHOU CHENG (galas, Menggatal) | `MGT` | — |
| J&T / JBT. AIR NEGERI SABAH (Menggatal) | `MGT` | — |
| BEST MART HOLDING (perkakasan Menggatal) | `MGT` | — |
| MR. D.I.Y / KTS TRADING / MEGANIK (Menggatal) | `MGT` | — |
| DIN HIONG / MEZIN (perkakasan Menggatal) | `MGT` | — |
| SABAH FISH MARKETING / SAGMA MARKET (makanan ikan) | `MGT` | — |
| TAOBAO-YI HAO QI HANG (pelekat baja) | `MGT` | — |
| TAOBAO-SEN YOU GUAN FANG / JIN SHANG XU MU | `MGT` | — |
| TAOBAO-GI NET / ERMINGZE (jaring dawai, Menggatal) | `MGT` | — |
| KK SEAL ENTERPRISE (seal — SAB9698C) | `R9698` | `OIL9698` |
| DIGNITY BRAND (busi — SAB9698C) | `R9698` | `OIL9698` |
| SHELL BUNDUSAN — bahan api SAB6323H | `OIL6323` | `OIL9698` |
| SHELL BUNDUSAN — bahan api Ativa QCV920 | `OIL920` | `OILOTH` |
| SHELL SYT. EXCEL — bahan api SD9922H | `OIL9922` | `OIL9882` |
| EMART (bekalan pembersihan) | `MBC` | `MBOR` |
| KFC / restoran makanan segera (makanan kakitangan kilang) | `MBSM_K` | — |
| LIDO MARKET (barangan runcit pejabat) | `MBOR` | `MBSM_K` |
| MIX STORE (barangan runcit pejabat) | `MBOR` | `MBSM_K` |
| HO KEE HAINANESE CHICKEN RICE (makanan kakitangan kilang) | `MBSM_K` | `MBSM_O` |
| HONG JIA TING / BOWL & SUPERFOOD (makanan kakitangan kilang) | `MBSM_K` | — |
| ORIENTAL COFFEE (KL) (kakitangan pejabat) | `MBSM_O` | `MBSM_K` |

Apabila pembekal BARU muncul dan tiada peraturan yang meliputinya, tanya
sebelum meneka — satu soalan lebih murah daripada satu pembetulan.

## Tabiat keying amaun (separuh lagi pembetulan Jun)

- Salin digit sen tepat daripada resit/invois Taobao (46.65, bukan 46.60).
  17 daripada 31 pembetulan Jun ialah kesilapan taip pada peringkat sen.
- Selepas keying resit berasingan, semak bahagian-bahagiannya berjumlah semula
  kepada jumlah resit.
- Penyesuaian bulanan (`dev/import/legacy-tieout/README.md`) akan menangkap
  apa-apa yang terlepas — jalankannya pada setiap hujung bulan.
