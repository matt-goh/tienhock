// src/components/ChangelogModal.tsx
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import Button from "./Button";

type Language = "ms" | "en";

type ChangelogEntry = {
  date: string; // ISO yyyy-mm-dd
  ms: string;
  en: string;
};

const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    date: "2026-06-05",
    ms: "Payroll Details kini menunjukkan ringkasan Pinjam di bahagian bawah halaman apabila pekerja ada pinjam pada bulan itu, memaparkan gaji akhir selepas ditolak pinjam (Final Mid-Month Pay dan Jumlah Masuk Bank). Ringkasan ini hanya pada halaman dan tidak muncul dalam payslip. Di halaman Sistem Pinjam, klik pada badan kad pekerja untuk terus pergi ke ringkasan Pinjam di bahagian bawah Payroll Details pekerja itu.",
    en: "Payroll Details now shows a Pinjam summary at the bottom of the page when an employee has pinjam that month, displaying the final pay after pinjam deductions (Final Mid-Month Pay and Jumlah Masuk Bank). This summary is page-only and does not appear on the payslip. On the Pinjam System page, click an employee card's body to jump straight to the Pinjam summary at the bottom of that employee's Payroll Details.",
  },
  {
    date: "2026-06-05",
    ms: "Pembetulan Gaji Kasar: kerja harian yang dicatat pada hari cuti tidak lagi ditambah ke dalam gaji kasar. Hari cuti sudah dibayar di bahagian Cuti, jadi kerja pada hari yang sama (contohnya bungkusan atau dulang) tidak lagi dikira dua kali. Jumlah Gaji Kasar dalam Payroll Details dan payslip kini sama dengan jumlah baris yang dipaparkan.",
    en: "Gross pay fix (RAMBU & DANISH, etc.): daily work recorded on a leave day is no longer added to gross pay. The leave day is already paid in the Cuti section, so work logged on the same day (e.g. packing bags or trays) is no longer double-counted. The Jumlah Gaji Kasar in Payroll Details and payslips now matches the sum of the lines shown.",
  },
  {
    date: "2026-06-05",
    ms: "Pembetulan Payroll: entri Others (Kerja Luar OT) yang menggunakan paycode jenis Overtime kini dipaparkan dan dijumlahkan di bahagian Overtime dalam Payroll Details dan payslip.",
    en: "Payroll fix: Others (Kerja Luar OT) entries that use an Overtime paycode now appear and total under Overtime in Payroll Details and payslips.",
  },
  {
    date: "2026-06-05",
    ms: "Pembetulan PCB: gaji dengan sen kini dipadankan kepada julat PCB yang betul, contohnya RM5,975.78 menggunakan julat RM5,976-RM5,980 supaya potongan PCB muncul dalam payslip.",
    en: "PCB fix: salary amounts with cents now match the correct PCB range, for example RM5,975.78 uses the RM5,976-RM5,980 range so the PCB deduction appears on the payslip.",
  },
  {
    date: "2026-06-05",
    ms: "Pembetulan Sistem Pinjam: rekod pinjam kini boleh disimpan untuk ID staf yang panjang seperti JASSON_ROLL.",
    en: "Pinjam System fix: pinjam records can now be saved for longer staff IDs such as JASSON_ROLL.",
  },
  {
    date: "2026-06-05",
    ms: "Pembetulan kerja lebih masa Bihun: apabila pekerja ada jam dalam ruangan OT 'jaga stim' di samping kerja lebih masa biasa, setiap baris OT kini dibayar mengikut jamnya sendiri, bukan kedua-dua baris dibayar mengikut jumlah gabungan. Ini membetulkan jumlah OT yang terlebih bayar dalam Payroll Details.",
    en: "Fixed Bihun overtime: when a worker has hours in the 'jaga stim' OT column on top of normal overtime, each overtime line is now paid for its own hours instead of both lines being paid the combined total. This corrects overstated OT amounts in Payroll Details.",
  },
  {
    date: "2026-06-04",
    ms: "Halaman Sistem Pinjam dikemas kini: ada kotak carian (atau terus menaip) untuk mencari pekerja dengan cepat mengikut nama atau ID kakitangan, kad pekerja kini lebih padat (hanya bahagian yang ada pinjam dipaparkan), butang tindakan kekal kelihatan di bahagian atas semasa menatal, dan halaman dibuka pada bulan sebelumnya sepanjang 1 hingga 7 hari bulan.",
    en: "The Pinjam System page has been refreshed: a search box — or just start typing — lets you quickly find an employee by name or staff ID, employee cards are now more compact (only the sections that have pinjam are shown), the action buttons stay visible at the top while you scroll, and the page opens to the previous month from the 1st through the 7th.",
  },
  {
    date: "2026-06-04",
    ms: "Pembetulan: Jumlah Bank dan Pinjam dalam Salary Report kini menggunakan gaji yang telah digenapkan sebelum menolak pinjam bulanan, supaya jumlah bayaran sepadan dengan Payroll Details dan halaman Pinjam.",
    en: "Fix: Bank and Pinjam totals in Salary Report now use the rounded salary before monthly pinjam is deducted, so payment amounts match Payroll Details and the Pinjam page.",
  },
  {
    date: "2026-06-03",
    ms: "Memproses semula gaji bulanan kini menggunakan kadar semasa setiap kod gaji untuk semua hari dalam bulan, jadi perubahan kadar selepas jam kerja direkod akan digunakan untuk semua hari (sebelum ini sesetengah hari mengekalkan kadar lama).",
    en: "Reprocessing a monthly payroll now applies each pay code's current rate to every day in the month, so a rate change made after hours were logged takes effect for all days (previously some days could keep the old rate).",
  },
  {
    date: "2026-06-03",
    ms: "Cuti dalam Log Harian kini menyimpan bayaran cuti tanpa menambah aktiviti kerja harian pada hari cuti — untuk semua pekerja, termasuk Salesman dan Salesman Ikut.",
    en: "Daily Log leave now keeps the leave pay amount without adding daily work activities on the leave day — for all workers, including Salesman and Salesman Ikut.",
  },
  {
    date: "2026-06-02",
    ms: "Halaman Payroll kini dibuka pada bulan sebelumnya sepanjang 1 hingga 7 hari bulan jika tiada bulan dipilih, supaya pemprosesan gaji bulan lepas lebih mudah.",
    en: "Payroll now opens to the previous month from the 1st through the 7th when no month is selected, making it easier to finish last month's payroll.",
  },
  {
    date: "2026-06-02",
    ms: "Halaman MEE Packing Cuti dan Bihun Packing Cuti kini ada pemilih tarikh supaya tarikh lebih awal boleh dibuka terus tanpa menekan butang hari sebelumnya berkali-kali.",
    en: "MEE Packing Cuti and Bihun Packing Cuti now have a date picker so earlier dates can be opened directly without repeatedly pressing the previous-day button.",
  },
  {
    date: "2026-05-28",
    ms: "Halaman Others (Kerja Luar OT) kini menyokong entri pelbagai tarikh dan pelbagai staf dalam satu langkah. Pilih beberapa hari pada satu staf/paycode untuk menyimpannya sebagai entri berkait — kadar, kuantiti, paycode dan keterangan akan sentiasa selaras merentas semua tarikh berkait. Gunakan butang \"Add multiple staff\" untuk menambah baris yang sama untuk beberapa staf sekaligus (sesuai untuk FULL HARIAN, HADIR_MEETING, dan sebagainya). Entri berkait ditanda dengan ikon rantai 🔗 pada senarai, dan padam akan mengeluarkan semua tarikh berkait setelah disahkan. Pembetulan: tarikh dalam modal edit Others tidak lagi tersusut sehari lebih awal.",
    en: "The Others (Kerja Luar OT) page now supports multi-date and multi-staff entries in one step. Pick several days for one staff/paycode to save them as a linked entry — the rate, quantity, paycode, and description stay in sync across every linked date. Use the new \"Add multiple staff\" button to fan out the same row to many staff at once (e.g. FULL HARIAN, HADIR_MEETING). Linked entries show a 🔗 badge in the list, and deleting one prompts to remove all the linked dates together. Fix: the edit modal no longer shows the date one day earlier than what was saved.",
  },
  {
    date: "2026-05-25",
    ms: "Eksport PCB di e-Caruman kini mengikut susun atur fail CP39 LHDN yang standard, termasuk medan nombor cukai, kod isteri, nama, nombor kad pengenalan, pasport, kod negara, amaun PCB dan CP38 pada panjang medan yang betul.",
    en: "The PCB export in e-Caruman now follows the standard LHDN CP39 file layout, with tax number, wife code, name, IC number, passport, country code, PCB amount, and CP38 amount written at the correct field lengths.",
  },
  {
    date: "2026-05-25",
    ms: "Halaman Payroll: butang cetak payslip pukal kini dinamakan \"Print Payslips\" dan membuka menu pilihan apabila dihover. Menu menyenaraikan semua bahagian kerja (contoh: Mee Production, Packing Mee, Packing Bihun, Office, Salesman) yang ada dalam payroll bulan tersebut. Setiap bahagian mempunyai kotak semak untuk pilih beberapa bahagian dicetak bersama dalam satu PDF, butang cetak pantas untuk mencetak bahagian itu sahaja, serta butang Select All di bahagian atas. Secara lalai semua bahagian ditandakan, jadi mengklik Print di bahagian bawah sama seperti mencetak semua payslip seperti sebelum ini.",
    en: "Payroll page: the bulk payslip print button is now labelled \"Print Payslips\" and opens a selection menu on hover. The menu lists all work sections (e.g. Mee Production, Packing Mee, Packing Bihun, Office, Salesman) present in that month's payroll. Each section has a checkbox to pick multiple sections to print together in one PDF, a quick-print button to print just that section, and a Select All toggle at the top. All sections are checked by default, so clicking Print at the bottom prints every payslip just like before.",
  },
  {
    date: "2026-05-24",
    ms: "Caruman SOCSO kini termasuk amaun SKBBK baharu yang diwajibkan PERKESO untuk gaji Jun 2026 dan seterusnya. Bagi pekerja di bawah 60 tahun, jumlah caruman pekerja ialah Keilatan + SKBBK; pekerja 60 tahun ke atas membayar SKBBK sahaja. Eksport SOCSO dan SIP kerajaan telah digabungkan menjadi satu fail SOCSO-SIP{MMYY}.TXT dalam folder SOCSO-SIP/. Kedua-dua kad SOCSO dan SIP di halaman e-Caruman kini memuat turun fail gabungan yang sama. Halaman Contribution Rates juga dikemas kini untuk menunjukkan kadar SKBBK baharu, yang boleh diedit.",
    en: "SOCSO contributions now include the new SKBBK amount required by PERKESO for June 2026 payrolls onward. For employees under 60, the employee contribution is Keilatan + SKBBK; employees 60 and above pay SKBBK only. The SOCSO and SIP government exports were merged into a single SOCSO-SIP{MMYY}.TXT file in the new SOCSO-SIP/ folder, and both the SOCSO and SIP cards on the e-Caruman page now download that same combined file. The Contribution Rates page was updated to show and allow editing of the new SKBBK rate.",
  },
  {
    date: "2026-05-23",
    ms: "Pembetulan: Tarikh cuti dalam Log Bulanan kadangkala dipaparkan sehari lebih awal daripada tarikh yang disimpan apabila halaman dibuka semula. Tarikh kini dipaparkan dengan betul.",
    en: "Fix: Leave dates in Monthly Logs sometimes displayed one day earlier than the saved date when the page was reopened. Dates now display correctly.",
  },
  {
    date: "2026-05-21",
    ms: "Pembetulan: Cuti Tahunan yang ditambah dalam Log Bulanan kini dikira sebagai bayaran cuti biasa, bukan sebagai pendahuluan. Hanya rekod Cuti Tahunan daripada Others (Advance) dikira sebagai pendahuluan.",
    en: "Fix: Annual Leave added in Monthly Logs is now treated as regular leave pay, not an advance. Only Annual Leave records from Others (Advance) are treated as advances.",
  },
  {
    date: "2026-05-21",
    ms: "Halaman MEE Packing Cuti dan Bihun Packing Cuti kini tersedia dalam Payroll untuk merekod cuti pekerja packing harian dengan jumlah bayaran manual. Rekod ini akan masuk dalam pengiraan gaji dan semakan baki cuti.",
    en: "MEE Packing Cuti and Bihun Packing Cuti pages are now available in Payroll for daily packing-worker leave with manual payment amounts. These records are included in payroll calculations and leave balance checks.",
  },
  {
    date: "2026-05-21",
    ms: "Log Bulanan kini boleh menetapkan jumlah bayaran cuti semasa menambah cuti, dengan RM65 sebagai jumlah asal. Jumlah cuti baharu dan yang sudah disimpan boleh diedit dan digunakan dalam pengiraan gaji.",
    en: "Monthly Logs can now set a leave payment amount when adding leave, with RM65 as the default. New and saved leave amounts can be edited and used in payroll calculations.",
  },
  {
    date: "2026-05-20",
    ms: 'Dokumen Pelarasan diperkenalkan dalam Sales: Nota Kredit, Nota Debit dan Nota Refund kini boleh dikeluarkan dari halaman butiran invois dan diuruskan di halaman baru "Adjustment Documents" di bawah Sales. Nota Kredit boleh mengeluarkan Nota Refund berpasangan secara automatik apabila invois sudah dibayar. Pembatalan dokumen akan membalikkan kesan kepada baki invois, kredit pelanggan, dan rekod perakaunan.',
    en: 'Adjustment Documents introduced in Sales: Credit, Debit, and Refund Notes can now be issued from the invoice details page and managed at a new "Adjustment Documents" page under Sales. Credit Notes can automatically issue a paired Refund Note when the invoice is already paid. Cancelling a document reverses its effect on the invoice balance, customer credit, and accounting entries.',
  },
  {
    date: "2026-05-20",
    ms: 'Halaman baru "Production Records" ditambah dalam Stock untuk melihat rekod pengeluaran mengikut hari, kategori, produk dan pekerja, dengan pautan terus untuk mengedit di Production Entry.',
    en: 'New "Production Records" page in Stock for viewing production records by day, category, product, and worker, with direct links back to Production Entry for editing.',
  },
  {
    date: "2026-05-19",
    ms: "Jelly Polly kini mempunyai halaman Ringkasan Jualan sendiri yang memaparkan hanya produk Jelly Polly. Ringkasan Jualan Tien Hock tidak lagi memasukkan data Jelly Polly, dan PDF Jelly Polly menggunakan \"JELLY POLLY FOOD INDUSTRIES\" sebagai tajuk syarikat.",
    en: "Jelly Polly now has its own Sales Summary page showing only Jelly Polly products. The Tien Hock Sales Summary no longer includes Jelly Polly data.",
  },
  {
    date: "2026-05-19",
    ms: "Pembetulan: Pekerja yang mempunyai lebih daripada satu ID kini berkongsi satu jumlah kelayakan cuti (Tahunan, Sakit, Umum, Rawatan) berdasarkan nama penuh — sama seperti cara sistem gaji mengumpulkannya.",
    en: "Fix: Staff with multiple IDs now share a single leave entitlement (Tahunan, Sakit, Umum, Rawatan) grouped by full name — matching how the payroll system already groups them.",
  },
  {
    date: "2026-05-19",
    ms: 'Kemasukan Pengeluaran kini menyokong EMPTY_BAG, EMPTY_BAG(S), SBH dan SMEE — dipaparkan dalam bahagian baru "Other Products". EMPTY_BAG dan EMPTY_BAG(S) memaparkan pekerja MEE dan BH; SBH hanya BH; SMEE hanya MEE. Produk ini juga boleh dibuka dalam modal Pemetaan Kod Bayaran Produk.',
    en: 'Production Entry now supports EMPTY_BAG, EMPTY_BAG(S), SBH, and SMEE — shown in a new "Other Products" section. EMPTY_BAG and EMPTY_BAG(S) list both MEE and BH packing workers; SBH lists BH only; SMEE lists MEE only. These products can also be opened in the Product Pay Code Mapping modal.',
  },
  {
    date: "2026-05-19",
    ms: "Jenis cuti baru ditambah: Cuti Rawatan (60 hari setahun) — boleh dipilih dalam Log Harian dan Log Bulanan, dan dipaparkan dalam Laporan Cuti.",
    en: "New leave type added: Cuti Rawatan / Hospital Leave (60 days per year) — selectable in Daily Log and Monthly Log, and shown in the Leave Report.",
  },
  {
    date: "2026-05-19",
    ms: 'Halaman baru "Others (Kerja Luar OT)" dalam Payroll untuk merekod OT kerja luar — entri akan keluar pada slip gaji setiap pekerja sebagai pendahuluan.',
    en: 'New "Others (Kerja Luar OT)" page in Payroll for recording outside-work overtime — entries appear on each employee\'s payslip as an advance.',
  },
  {
    date: "2026-05-19",
    ms: 'Rekod "Others (Advance)" dan "Others (Kerja Luar OT)" yang berulang dengan keterangan sama kini bergabung jadi satu baris dalam Payroll Details dan slip gaji.',
    en: 'Duplicate "Others (Advance)" and "Others (Kerja Luar OT)" entries with the same description now combine into a single line on the Payroll Details page and payslip.',
  },
  {
    date: "2026-05-19",
    ms: "Log Bulanan SAPU dan MAINTENANCE kini memisahkan jam biasa, OT, Ahad, OT Ahad, Umum, dan OT Umum supaya kiraan gaji ikut kadar yang betul.",
    en: "SAPU and MAINTENANCE Monthly Logs now separate regular, OT, Sunday, Sunday OT, Public Holiday, and Public Holiday OT hours so payroll uses the correct rates.",
  },
  {
    date: "2026-05-19",
    ms: "Pembetulan: Jumlah Gaji Kasar untuk salesman kini termasuk unit FOC, jadi jumlah asas dan payslip sepadan.",
    en: "Fix: Salesman gross pay now includes FOC units, so base totals and payslips match.",
  },
  {
    date: "2026-05-19",
    ms: "Pembetulan: Gaji Genap sebelum pinjam kini mengikut jumlah akhir gaji yang telah digenapkan.",
    en: "Fix: Gaji Genap before pinjam now matches the final rounded payroll amount.",
  },
  {
    date: "2026-05-18",
    ms: "Eksport PDF untuk gaji pertengahan bulan kini tersedia.",
    en: "Mid-month payroll PDF export is now available.",
  },
  {
    date: "2026-05-18",
    ms: "Jam kerja Ahad dan Hari Umum boleh ditambah dalam Log Bulanan.",
    en: "Sunday and Public Holiday hours can now be entered in the Monthly Log.",
  },
  {
    date: "2026-05-18",
    ms: "Jumlah bayaran cuti (Cuti Umum / Sakit / Tahunan) kini boleh diedit terus dalam Log Harian.",
    en: "Leave payment amounts (Cuti Umum / Sakit / Tahunan) can now be edited directly in the Daily Log.",
  },
  {
    date: "2026-05-18",
    ms: 'Kalendar Cuti kini ada kotak semak "Cuti Umum" — kelayakan tahunan Cuti Umum setiap pekerja dikira secara automatik daripada tarikh yang ditandakan.',
    en: 'The Holiday Calendar now has a "Cuti Umum" checkbox — each staff member\'s yearly Cuti Umum allowance is calculated automatically from the dates you tick.',
  },
  {
    date: "2026-05-18",
    ms: '"Commission" ditukar nama menjadi "Others (Advance)".',
    en: '"Commission" has been renamed to "Others (Advance)".',
  },
  {
    date: "2026-05-18",
    ms: 'Modal "Tambah Cuti" baharu — boleh menambah cuti untuk ramai pekerja sekaligus.',
    en: 'New "Add Leave" dialog — you can add leave for multiple staff at once.',
  },
  {
    date: "2026-05-18",
    ms: "Pembetulan: Jam lebih masa (OT) tidak lagi dikira dua kali dalam gaji asas.",
    en: "Fix: Overtime (OT) hours are no longer double-counted in base pay.",
  },
  {
    date: "2026-05-18",
    ms: "Pembetulan: Tarikh hari kelepasan kini dipaparkan dengan betul.",
    en: "Fix: Holiday dates now display correctly.",
  },
  {
    date: "2026-05-18",
    ms: '"Self Billed Invoice" telah dinaik taraf menjadi "General Purchase" — pembelian tempatan turut disokong sekarang.',
    en: '"Self Billed Invoice" has been upgraded to "General Purchase" — local purchases are now supported too.',
  },
  {
    date: "2026-05-18",
    ms: "Pembelian bahan kini berkait terus dengan stok.",
    en: "Material purchases are now linked directly to stock.",
  },
];

const MONTH_NAMES: Record<Language, string[]> = {
  ms: [
    "Januari",
    "Februari",
    "Mac",
    "April",
    "Mei",
    "Jun",
    "Julai",
    "Ogos",
    "September",
    "Oktober",
    "November",
    "Disember",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

const formatDate = (iso: string, language: Language): string => {
  const [yearStr, monthStr, dayStr] = iso.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const day = Number(dayStr);
  const monthName = MONTH_NAMES[language][monthIndex] ?? monthStr;
  return `${day} ${monthName} ${year}`;
};

const LABELS = {
  ms: {
    title: "Log Perubahan",
    close: "Tutup",
  },
  en: {
    title: "Changelog",
    close: "Close",
  },
} as const;

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  const [language, setLanguage] = useState<Language>("ms");

  useEffect(() => {
    if (isOpen) {
      setLanguage("ms");
    }
  }, [isOpen]);

  const labels = LABELS[language];

  const renderToggle = () => {
    const segmentBase =
      "px-3 py-1 text-sm font-medium transition-colors duration-150";
    const activeClasses =
      "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300";
    const inactiveClasses =
      "text-default-600 dark:text-gray-400 hover:bg-default-100 dark:hover:bg-gray-700";

    return (
      <div
        className="inline-flex rounded-full border border-default-200 dark:border-gray-700 overflow-hidden"
        role="group"
        aria-label="Language toggle"
      >
        <button
          type="button"
          onClick={() => setLanguage("ms")}
          className={`${segmentBase} ${
            language === "ms" ? activeClasses : inactiveClasses
          }`}
        >
          BM
        </button>
        <button
          type="button"
          onClick={() => setLanguage("en")}
          className={`${segmentBase} ${
            language === "en" ? activeClasses : inactiveClasses
          }`}
        >
          ENG
        </button>
      </div>
    );
  };

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog
        className="fixed inset-0 z-50 overflow-y-auto"
        open={isOpen}
        onClose={onClose}
      >
        <div className="min-h-screen px-4 text-center">
          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <DialogPanel className="fixed inset-0 bg-black/50 dark:bg-black/70" />
          </TransitionChild>

          <span className="inline-block h-screen align-middle">&#8203;</span>

          <TransitionChild
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="inline-block w-full max-w-6xl p-4 overflow-hidden text-left align-middle transition-all transform bg-white dark:bg-gray-800 shadow-xl rounded-2xl">
              <div className="flex justify-between items-center">
                <DialogTitle
                  as="h3"
                  className="text-lg font-medium leading-6 text-default-800 dark:text-gray-100"
                >
                  {labels.title}
                </DialogTitle>
                {renderToggle()}
              </div>

              <div className="mt-4 max-h-[67vh] overflow-y-auto pr-1">
                <ul className="list-disc pl-6 space-y-2 text-default-700 dark:text-gray-200">
                  {CHANGELOG_ENTRIES.map((entry, index) => (
                    <li key={index} className="leading-relaxed">
                      <span className="text-xs text-default-500 dark:text-gray-400 mr-1">
                        {formatDate(entry.date, language)} —
                      </span>
                      <span>{entry[language]}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-end">
                <Button onClick={onClose} variant="outline">
                  {labels.close}
                </Button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
};

export default ChangelogModal;
