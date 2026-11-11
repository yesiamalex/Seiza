// The sources behind Seizora's numbers. Info cards list the ones they rely
// on (sim/info.ts), and worlds/seizora/README.md has the full list with
// what each one is used for. Journal entries were checked against Crossref.

export type RefKey =
  | "duffie2013"
  | "haurwitz1945"
  | "reno2012"
  | "kasten1980"
  | "meeus1998"
  | "pagasa"
  | "dobos2014"
  | "doeSolar"
  | "dupre2015"
  | "jost2020"
  | "manwell2009"
  | "ge15"
  | "cole2019"
  | "eia2021"
  | "doeNgef"
  | "nrelChart"
  | "green2014"
  | "boyd2019"
  | "khenkin2020"
  | "meti2024"
  | "npc2025"
  | "pagasa2026"
  | "pagasa2024end"
  | "inquirer2024"
  | "mb2024"
  | "pia2024"
  | "tribune2024"
  | "gma2021"
  | "teko2024"
  | "psa2020";

export interface Reference {
  /** Short form shown on cards. */
  short: string;
  /** Full APA-style entry. */
  full: string;
  url?: string;
}

export const REFERENCES: Record<RefKey, Reference> = {
  duffie2013: {
    short: "Duffie & Beckman (2013)",
    full: "Duffie, J. A., & Beckman, W. A. (2013). Solar engineering of thermal processes (4th ed.). Wiley.",
    url: "https://doi.org/10.1002/9781118671603",
  },
  haurwitz1945: {
    short: "Haurwitz (1945)",
    full: "Haurwitz, B. (1945). Insolation in relation to cloudiness and cloud density. Journal of Meteorology, 2(3), 154–166.",
    url: "https://doi.org/10.1175/1520-0469(1945)002<0154:IIRTCA>2.0.CO;2",
  },
  reno2012: {
    short: "Reno, Hansen & Stein (2012)",
    full: "Reno, M. J., Hansen, C. W., & Stein, J. S. (2012). Global horizontal irradiance clear sky models: Implementation and analysis (SAND2012-2389). Sandia National Laboratories.",
    url: "https://doi.org/10.2172/1039404",
  },
  kasten1980: {
    short: "Kasten & Czeplak (1980)",
    full: "Kasten, F., & Czeplak, G. (1980). Solar and terrestrial radiation dependent on the amount and type of cloud. Solar Energy, 24(2), 177–189.",
    url: "https://doi.org/10.1016/0038-092X(80)90391-6",
  },
  meeus1998: {
    short: "Meeus (1998)",
    full: "Meeus, J. (1998). Astronomical algorithms (2nd ed.). Willmann-Bell.",
  },
  pagasa: {
    short: "PAGASA, climate of the Philippines",
    full: "Philippine Atmospheric, Geophysical and Astronomical Services Administration. Climate of the Philippines (the modified Coronas climate types).",
    url: "https://www.pagasa.dost.gov.ph/information/climate-philippines",
  },
  dobos2014: {
    short: "Dobos (2014), PVWatts",
    full: "Dobos, A. P. (2014). PVWatts version 5 manual (NREL/TP-6A20-62641). National Renewable Energy Laboratory.",
    url: "https://doi.org/10.2172/1158421",
  },
  doeSolar: {
    short: "DOE Philippines, solar rough estimate",
    full: "Department of Energy, Philippines. Solar panels rough estimate for residential use (Metro Manila PVOUT of 1,402.1 kWh/kWp from the Global Solar Atlas).",
    url: "https://doe.gov.ph/sites/default/files/pdf/consumer_connect/Solar-Panels-Rough-Estimate-for-Residential-Use.pdf",
  },
  dupre2015: {
    short: "Dupré, Vaillon & Green (2015)",
    full: "Dupré, O., Vaillon, R., & Green, M. A. (2015). Physics of the temperature coefficients of solar cells. Solar Energy Materials and Solar Cells, 140, 92–100.",
    url: "https://doi.org/10.1016/j.solmat.2015.03.025",
  },
  jost2020: {
    short: "Jošt et al. (2020)",
    full: "Jošt, M., Lipovšek, B., Glažar, B., Al-Ashouri, A., et al. (2020). Perovskite solar cells go outdoors: Field testing and temperature effects on energy yield. Advanced Energy Materials, 10(25), 2000454.",
    url: "https://doi.org/10.1002/aenm.202000454",
  },
  manwell2009: {
    short: "Manwell, McGowan & Rogers (2009)",
    full: "Manwell, J. F., McGowan, J. G., & Rogers, A. L. (2009). Wind energy explained: Theory, design and application (2nd ed.). Wiley.",
    url: "https://doi.org/10.1002/9781119994367",
  },
  ge15: {
    short: "GE 1.5 MW turbine data",
    full: "Wind-turbine-models.com. GE 1.5s and 1.5sle technical data (rotor 70.5 to 77 m, hub heights about 60 to 100 m, cut-in 3.5 to 4 m/s, rated 12 to 13 m/s, cut-out 25 m/s, rotor 10 to 20 rpm).",
    url: "https://en.wind-turbine-models.com/turbines/565-ge-vernova-ge-1-5s",
  },
  cole2019: {
    short: "Cole & Frazier (2019), NREL",
    full: "Cole, W., & Frazier, A. W. (2019). Cost projections for utility-scale battery storage (NREL/TP-6A20-73222). National Renewable Energy Laboratory.",
    url: "https://doi.org/10.2172/1529218",
  },
  eia2021: {
    short: "EIA (2021)",
    full: "U.S. Energy Information Administration. (2021, February 12). Utility-scale batteries and pumped storage return about 80% of the electricity they store. Today in Energy.",
    url: "https://www.eia.gov/todayinenergy/detail.php?id=46756",
  },
  doeNgef: {
    short: "DOE Philippines, 2015–2017 grid emission factor",
    full: "Department of Energy, Philippines. (2018). 2015–2017 National Grid Emission Factor (Luzon–Visayas simple operating margin: 0.7122 tCO2/MWh).",
    url: "https://legacy.doe.gov.ph/node/11258",
  },
  nrelChart: {
    short: "NREL best research-cell efficiencies",
    full: "National Renewable Energy Laboratory. Best research-cell efficiency chart (single-junction perovskite cells at about 27%).",
    url: "https://www.nrel.gov/pv/cell-efficiency.html",
  },
  green2014: {
    short: "Green, Ho-Baillie & Snaith (2014)",
    full: "Green, M. A., Ho-Baillie, A., & Snaith, H. J. (2014). The emergence of perovskite solar cells. Nature Photonics, 8(7), 506–514.",
    url: "https://doi.org/10.1038/nphoton.2014.134",
  },
  boyd2019: {
    short: "Boyd et al. (2019)",
    full: "Boyd, C. C., Cheacharoen, R., Leijtens, T., & McGehee, M. D. (2019). Understanding degradation mechanisms and improving stability of perovskite photovoltaics. Chemical Reviews, 119(5), 3418–3451.",
    url: "https://doi.org/10.1021/acs.chemrev.8b00336",
  },
  khenkin2020: {
    short: "Khenkin et al. (2020), ISOS",
    full: "Khenkin, M. V., et al. (2020). Consensus statement for stability assessment and reporting for perovskite photovoltaics based on ISOS procedures. Nature Energy, 5(1), 35–49.",
    url: "https://doi.org/10.1038/s41560-019-0529-5",
  },
  meti2024: {
    short: "pv magazine (2024), METI 20 GW target",
    full: "pv magazine. (2024, November 28). Japan aims to deploy 20 GW of perovskite solar by 2040.",
    url: "https://www.pv-magazine.com/2024/11/28/japan-aims-to-deploy-20-gw-of-perovskite-solar-by-2040/",
  },
  npc2025: {
    short: "NPC, Missionary Electrification Plan 2025–2029",
    full: "National Power Corporation. Missionary electrification plan 2025–2029 (Small Power Utilities Group, off-grid areas).",
    url: "https://www.napocor.gov.ph/wp-content/uploads/Operations/NPC_Missionary_Electrification_Plan_2025-2029.pdf",
  },
  pagasa2026: {
    short: "GMA News (2026), PAGASA El Niño outlook",
    full: "GMA News. (2026, July 28). Very strong El Niño likely from October 2026 to January 2027 — PAGASA (81% chance of a very strong El Niño; below-normal rainfall; drought likely in Cebu and seven other provinces by end of August).",
    url: "https://www.gmanetwork.com/news/weather/content/996484/very-strong-el-ni-o-likely-from-october-2026-to-january-2027-pagasa/story/",
  },
  pagasa2024end: {
    short: "PAGASA ENSO monitoring",
    full: "Philippine Atmospheric, Geophysical and Astronomical Services Administration. El Niño / La Niña monitoring and ENSO advisories (El Niño conditions July 2023 to May 2024; a strong to very strong El Niño present as of October 2026).",
    url: "https://www.pagasa.dost.gov.ph/climate/el-nino-la-nina/monitoring",
  },
  inquirer2024: {
    short: "Inquirer (2024), Luzon red alert",
    full: "Philippine Daily Inquirer. (2024, April 16). Luzon and Visayas grids placed under yellow, red alert (Luzon red alert 2 to 4 p.m. and 6 to 9 p.m.; 19 plants on forced outage, 3 derated).",
    url: "https://business.inquirer.net/454876/luzon-and-visayas-grids-placed-under-yellow-red-alert",
  },
  mb2024: {
    short: "Manila Bulletin (2024), rotational brownouts",
    full: "Manila Bulletin. (2024, April 18). Red alert strikes again: Luzon grid wobbles anew into rotational brownouts.",
    url: "https://mb.com.ph/2024/4/18/red-alert-strikes-again-luzon-grid-wobbles-anew-into-rotational-brownouts",
  },
  pia2024: {
    short: "PIA (2024), Metro Manila record heat",
    full: "Philippine Information Agency. (2024, April 29). Metro Manila logs highest temperature in history (38.8 °C at NAIA, Pasay, on 27 April 2024).",
    url: "https://pia.gov.ph/news/2024/04/29/metro-manila-logs-highest-temperature-in-history",
  },
  tribune2024: {
    short: "Daily Tribune (2024), Meralco rates",
    full: "Romero, M. B. (2024, June 14). Brace for June power bill hike. Daily Tribune (Meralco's rates for residential customers consuming 200 kWh a month).",
    url: "https://tribune.net.ph/2024/06/13/brace-for-june-power-bill-hike",
  },
  gma2021: {
    short: "GMA News (2021), Meralco summer use",
    full: "GMA News. (2021). Meralco expects power rate hike in April (summer may raise residential consumption by 10% to 40% over January and February, mainly from cooling).",
    url: "https://www.gmanetwork.com/news/money/economy/781853/meralco-expects-power-rate-hike-in-april/story",
  },
  teko2024: {
    short: "Teko.ph, aircon power draw",
    full: "Teko.ph. How much electricity does an aircon use? (a 1.0 HP non-inverter unit draws about 850 to 1,000 W; an inverter unit about 700 to 900 W).",
    url: "https://teko.ph/tips/?p=4088",
  },
  psa2020: {
    short: "PSA, 2020 Census of Population and Housing",
    full: "Philippine Statistics Authority. (2022). 2020 Census of Population and Housing: household population, number of households, and average household size (4.1 persons, down from 4.4 in 2015).",
  },
};
