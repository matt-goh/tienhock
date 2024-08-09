import React, { useState } from "react";

const MeeProduction = () => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [shift, setShift] = useState("Day");
  const [hari, setHari] = useState("Biasa");
  const [jumlahTepung, setJumlahTepung] = useState<number>(50);

  const toggleShift = () => {
    setShift((prevShift) => (prevShift === "Day" ? "Night" : "Day"));
  };

  const toggleHari = () => {
    setHari((prevHari) => {
      switch (prevHari) {
        case "Biasa":
          return "Ahad";
        case "Ahad":
          return "Umum";
        case "Umum":
          return "Biasa";
        default:
          return "Biasa";
      }
    });
  };

  const handleJumlahTepungChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*\.?\d*$/.test(value) && Number(value) <= 999) {
      setJumlahTepung(Number(value));
    }
  };

  return (
    <div className="flex items-center w-full p-8">
      <span className="font-medium mr-2">Date:</span>
      <div className="relative inline-block">
        <span className="font-medium ml-4 mr-2">Shift:</span>
        <button
          onClick={toggleShift}
          className="px-3 py-1.5 pl-0 hover:pl-3 hover:border hover:border-gray-300 hover:shadow-md rounded-lg text-right active:bg-gray-100 transition-all duration-200"
        >
          {shift}
        </button>
      </div>
      <div className="relative inline-block">
        <span className="font-medium ml-4 mr-2">Hari:</span>
        <button
          onClick={toggleHari}
          className="px-3 py-1.5 pl-0 hover:pl-3 hover:border hover:border-gray-300 hover:shadow-md rounded-lg text-right active:bg-gray-100 transition-all duration-200"
        >
          {hari}
        </button>
      </div>
      <div className="relative inline-block">
        <span className="font-medium ml-4 mr-2">Jumlah Tepung:</span>
        <input
          max={999}
          value={jumlahTepung}
          onChange={handleJumlahTepungChange}
          className="w-12 px-2 py-1.5 pl-0 hover:pl-2 hover:border hover:border-gray-300 hover:shadow-md rounded-lg hover:text-center transition-all duration-200"
        />
      </div>
    </div>
  );
};

export default MeeProduction;
