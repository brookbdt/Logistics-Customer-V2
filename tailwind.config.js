/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        gray7: "#777777",
        gray1: "#C6C4C4",
        grayInput: "#ABABAB",
        tableHeaderBg: "#F0F0F1",
        onSelect: "#314A62",
        primary: "#203C56",
        secondary: "#82B485",
        tertiary: "#4078AB",
        complementary: "#EC6738",
        linkedText: "#4178AB",
        labelUnassignedBg: "#DBFBEC",
        labelUnassignedText: "#0BDC78",
        labelUnassignedOutline: "#B8DBCA",
        labelAssignedBg: "#F1F3FF",
        labelAssignedText: "#3167E3",
        labelAssignedOutline: "#B1C5F6",
        labelFiredBg: "#FFF4F2",
        labelFiredText: "#F15950",
        labelFiredOutline: "#EEB3B1",
        labelSuspendedBg: "#F2ECE6",
        labelSuspendedText: "#CD7B2E",
        labelSuspendedOutline: "#EECEB0`",
        orderCardText: "#148C01",
      },
    },
    fontFamily: {
      sans: ["Inter", "sans-serif"],
      mon: ["Montserrat"],
    },
  },
  plugins: [],
};
