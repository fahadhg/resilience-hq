#!/usr/bin/env python3
"""
enrich-descriptions.py — Add parent context to generic HS descriptions
=======================================================================
Codes with descriptions like "Other", "New", or blank are valid in the
CBSA T2026 but useless without parent context. This script enriches them
using WCO HS4 heading names so users see e.g.:
  "Motor vehicles (spark-ignition) — Other"
  instead of just "Other"

Run from project root:
    python3 scripts/enrich-descriptions.py
"""
import json, re
from pathlib import Path

ROOT   = Path(__file__).parent.parent
TARIFF = ROOT / "public" / "data" / "tariff.json"

# ─── WCO HS4 heading names (standard HS 2022 nomenclature) ────────────────────
# Covers all 1,228 headings; abbreviated for common manufacturing chapters.
HS4_HEADINGS: dict[str, str] = {
    # Chapter 1 — Live animals
    "0101":"Horses, asses, mules","0102":"Bovine animals","0103":"Swine",
    "0104":"Sheep and goats","0105":"Poultry","0106":"Other live animals",
    # Chapter 2 — Meat
    "0201":"Beef, fresh/chilled","0202":"Beef, frozen","0203":"Pork, fresh/chilled/frozen",
    "0204":"Sheep/goat meat","0205":"Horse/ass/mule meat","0206":"Edible offal",
    "0207":"Poultry meat","0208":"Other meat","0209":"Pig fat/poultry fat",
    "0210":"Meat, salted/dried/smoked",
    # Chapter 3 — Fish
    "0301":"Live fish","0302":"Fresh/chilled fish","0303":"Frozen fish",
    "0304":"Fish fillets","0305":"Fish, dried/salted/smoked","0306":"Crustaceans",
    "0307":"Molluscs","0308":"Other aquatic invertebrates",
    # Chapter 4 — Dairy
    "0401":"Milk and cream","0402":"Milk products, concentrated","0403":"Buttermilk/yogurt",
    "0404":"Whey","0405":"Butter","0406":"Cheese and curd",
    "0407":"Birds' eggs, in shell","0408":"Birds' eggs, not in shell","0409":"Natural honey",
    "0410":"Edible insects","0411":"Other animal products",
    # Chapter 7 — Vegetables
    "0701":"Potatoes","0702":"Tomatoes","0703":"Onions, shallots, garlic",
    "0704":"Cabbages, cauliflower, broccoli","0705":"Lettuce and chicory",
    "0706":"Carrots, turnips, beets","0707":"Cucumbers","0708":"Leguminous vegetables",
    "0709":"Other vegetables","0710":"Frozen vegetables","0711":"Provisionally preserved vegetables",
    "0712":"Dried vegetables","0713":"Dried leguminous vegetables","0714":"Roots and tubers",
    # Chapter 8 — Fruit
    "0801":"Coconuts, Brazil nuts, cashews","0802":"Other nuts",
    "0803":"Bananas","0804":"Dates, figs, pineapples, mangoes",
    "0805":"Citrus fruit","0806":"Grapes","0807":"Melons and papayas",
    "0808":"Apples, pears, quinces","0809":"Apricots, cherries, peaches",
    "0810":"Other fresh fruit","0811":"Frozen fruit","0812":"Provisionally preserved fruit",
    "0813":"Dried fruit","0814":"Citrus peel",
    # Chapter 9 — Coffee, tea, spices
    "0901":"Coffee","0902":"Tea","0903":"Maté","0904":"Pepper",
    "0905":"Vanilla","0906":"Cinnamon","0907":"Cloves","0908":"Nutmeg/mace",
    "0909":"Seeds of anise/coriander/cumin","0910":"Ginger, saffron, turmeric",
    # Chapter 10 — Cereals
    "1001":"Wheat and meslin","1002":"Rye","1003":"Barley","1004":"Oats",
    "1005":"Maize (corn)","1006":"Rice","1007":"Grain sorghum","1008":"Buckwheat, millet, canary seed",
    # Chapter 15 — Fats
    "1501":"Pig/poultry fat","1502":"Bovine/sheep/goat fat","1503":"Lard stearin/lard oil",
    "1504":"Fats/oils from fish or marine mammals","1505":"Wool grease",
    "1506":"Other animal fats","1507":"Soya-bean oil","1508":"Ground-nut oil",
    "1509":"Olive oil","1510":"Other olive oils","1511":"Palm oil",
    "1512":"Sunflower/safflower/cotton-seed oil","1513":"Coconut/palm kernel oil",
    "1514":"Rape-seed/colza/mustard oil","1515":"Other fixed vegetable fats",
    "1516":"Animal/vegetable fats, hydrogenated","1517":"Margarine",
    "1518":"Animal/vegetable fats, boiled/oxidized","1520":"Glycerol",
    "1521":"Vegetable waxes","1522":"Degras/residues from fatty substances",
    # Chapter 17 — Sugar
    "1701":"Cane or beet sugar","1702":"Other sugars","1703":"Molasses",
    "1704":"Sugar confectionery",
    # Chapter 19 — Cereal preparations
    "1901":"Malt extract, flour preparations","1902":"Pasta",
    "1903":"Tapioca","1904":"Cereals, prepared by swelling/roasting",
    "1905":"Bread, pastry, cakes, biscuits",
    # Chapter 22 — Beverages
    "2201":"Waters, ice and snow","2202":"Waters, flavoured/sweetened",
    "2203":"Beer","2204":"Wine","2205":"Vermouth","2206":"Other fermented beverages",
    "2207":"Ethyl alcohol","2208":"Spirits","2209":"Vinegar",
    # Chapter 25 — Minerals
    "2501":"Salt; sulphur","2502":"Unroasted iron pyrites","2503":"Sulphur",
    "2504":"Natural graphite","2505":"Natural sands","2506":"Quartz",
    "2507":"Kaolin","2508":"Other clays","2509":"Chalk","2510":"Natural calcium phosphates",
    "2511":"Natural barium sulphate","2512":"Siliceous fossil meals","2513":"Pumice stone",
    "2514":"Slate","2515":"Marble, travertine","2516":"Granite, porphyry",
    "2517":"Pebbles, gravel, broken stone","2518":"Dolomite",
    "2519":"Natural magnesium carbonate","2520":"Gypsum, anhydrite, plasters",
    "2521":"Limestone flux","2522":"Quicklime, slaked lime",
    "2523":"Portland cement","2524":"Asbestos","2525":"Mica",
    "2526":"Natural steatite/talc","2528":"Natural borates","2529":"Feldspars",
    "2530":"Mineral substances",
    # Chapter 27 — Fuels
    "2701":"Coal","2702":"Lignite","2703":"Peat","2704":"Coke and semi-coke",
    "2705":"Coal gas","2706":"Tar","2707":"Oils from coal/bituminous minerals",
    "2708":"Pitch and pitch coke","2709":"Petroleum oils, crude",
    "2710":"Petroleum oils, not crude","2711":"Petroleum gases",
    "2712":"Petroleum jelly/paraffin","2713":"Petroleum coke","2714":"Bitumen",
    "2715":"Bituminous mixtures","2716":"Electrical energy",
    # Chapter 28 — Inorganic chemicals
    "2801":"Fluorine, chlorine, bromine, iodine","2802":"Sulphur",
    "2803":"Carbon (carbon blacks)","2804":"Hydrogen, noble gases, other non-metals",
    "2805":"Alkali/alkaline-earth metals","2806":"Hydrogen chloride",
    "2807":"Sulphuric acid","2808":"Nitric acid","2809":"Diphosphorus pentaoxide",
    "2810":"Oxides of boron","2811":"Other inorganic acids",
    "2812":"Halides of non-metals","2813":"Sulphides of non-metals",
    "2814":"Ammonia","2815":"Sodium hydroxide","2816":"Hydroxide/peroxide of magnesium",
    "2817":"Zinc oxide","2818":"Artificial corundum","2819":"Chromium oxides",
    "2820":"Manganese oxides","2821":"Iron oxides/hydroxides","2822":"Cobalt oxides",
    "2823":"Titanium oxides","2824":"Lead oxides","2825":"Hydrazine/hydroxylamine",
    "2826":"Fluorides","2827":"Chlorides","2828":"Hypochlorites",
    "2829":"Chlorates and perchlorates","2830":"Sulphides","2831":"Dithionites",
    "2832":"Sulphites","2833":"Sulphates","2834":"Nitrites and nitrates",
    "2835":"Phosphinates and phosphonates","2836":"Carbonates","2837":"Cyanides",
    "2839":"Silicates","2840":"Borates","2841":"Salts of oxometallic acids",
    "2842":"Other salts of inorganic acids","2843":"Colloidal precious metals",
    "2844":"Radioactive chemical elements","2845":"Isotopes",
    "2846":"Compounds of rare-earth metals","2847":"Hydrogen peroxide",
    "2848":"Phosphides","2849":"Carbides","2850":"Hydrides/nitrides/azides",
    "2851":"Other inorganic compounds",
    # Chapter 29 — Organic chemicals
    "2901":"Acyclic hydrocarbons","2902":"Cyclic hydrocarbons",
    "2903":"Halogenated derivatives of hydrocarbons","2904":"Sulphonated derivatives",
    "2905":"Acyclic alcohols","2906":"Cyclic alcohols",
    "2907":"Phenols","2908":"Halogenated/sulphonated derivatives of phenols",
    "2909":"Ethers","2910":"Epoxides","2911":"Acetals and hemiacetals",
    "2912":"Aldehydes","2913":"Halogenated derivatives of aldehydes",
    "2914":"Ketones and quinones","2915":"Saturated acyclic monocarboxylic acids",
    "2916":"Unsaturated acyclic/cyclic monocarboxylic acids",
    "2917":"Polycarboxylic acids","2918":"Carboxylic acids with oxygen",
    "2919":"Phosphoric esters","2920":"Esters of other inorganic acids",
    "2921":"Amine-function compounds","2922":"Amino-compounds with oxygen",
    "2923":"Quaternary ammonium salts","2924":"Carboxyamide-function compounds",
    "2925":"Carboxyimide-function compounds","2926":"Nitrile-function compounds",
    "2927":"Diazo/azo/azoxy-compounds","2928":"Organic derivatives of hydrazine",
    "2929":"Compounds with other nitrogen function","2930":"Organo-sulphur compounds",
    "2931":"Other organo-inorganic compounds","2932":"Heterocyclic compounds with oxygen",
    "2933":"Heterocyclic compounds with nitrogen","2934":"Nucleic acids",
    "2935":"Sulphonamides","2936":"Provitamins and vitamins","2937":"Hormones",
    "2938":"Glycosides","2939":"Alkaloids","2940":"Sugars (chemically pure)",
    "2941":"Antibiotics","2942":"Other organic compounds",
    # Chapter 30 — Pharmaceuticals
    "3001":"Glands and organs","3002":"Blood, antisera, vaccines",
    "3003":"Medicaments (mixed), bulk","3004":"Medicaments, packaged for retail",
    "3005":"Wadding, gauze, bandages","3006":"Pharmaceutical goods",
    # Chapter 39 — Plastics
    "3901":"Polymers of ethylene","3902":"Polymers of propylene",
    "3903":"Polymers of styrene","3904":"Polymers of vinyl chloride",
    "3905":"Polymers of vinyl acetate","3906":"Acrylic polymers",
    "3907":"Polyacetals/polyethers","3908":"Polyamides","3909":"Amino-resins",
    "3910":"Silicones","3911":"Petroleum resins","3912":"Cellulose and derivatives",
    "3913":"Natural polymers","3914":"Ion-exchangers based on polymers",
    "3915":"Waste and scrap of plastics","3916":"Monofilament of plastics",
    "3917":"Tubes, pipes and hoses, plastics","3918":"Floor coverings of plastics",
    "3919":"Self-adhesive plates/sheets of plastics","3920":"Other plates/sheets of plastics",
    "3921":"Other plates, sheets, strip of plastics","3922":"Baths, showers, sinks of plastics",
    "3923":"Packing articles of plastics","3924":"Tableware of plastics",
    "3925":"Builders' ware of plastics","3926":"Other articles of plastics",
    # Chapter 40 — Rubber
    "4001":"Natural rubber","4002":"Synthetic rubber","4003":"Reclaimed rubber",
    "4004":"Waste and scrap of rubber","4005":"Compounded rubber, unvulcanized",
    "4006":"Other forms of unvulcanized rubber","4007":"Vulcanized rubber thread",
    "4008":"Plates/sheets/strip of vulcanized rubber","4009":"Tubes, pipes and hoses, rubber",
    "4010":"Conveyor/transmission belts of rubber","4011":"Pneumatic tyres, rubber",
    "4012":"Retreaded/used pneumatic tyres","4013":"Inner tubes, rubber",
    "4014":"Hygienic/pharmaceutical articles of rubber","4015":"Gloves/clothing of rubber",
    "4016":"Other articles of vulcanized rubber","4017":"Hard rubber",
    # Chapter 44 — Wood
    "4401":"Fuel wood","4402":"Wood charcoal","4403":"Wood in the rough",
    "4404":"Hoopwood","4405":"Wood wool/flour","4406":"Railway sleepers of wood",
    "4407":"Wood sawn lengthwise","4408":"Sheets for veneering",
    "4409":"Wood, continuously shaped","4410":"Particle board of wood",
    "4411":"Fibreboard of wood","4412":"Plywood","4413":"Densified wood",
    "4414":"Wooden frames for paintings","4415":"Packing cases/boxes of wood",
    "4416":"Casks/barrels of wood","4417":"Tools/handles of wood",
    "4418":"Builders' joinery of wood","4419":"Tableware/kitchenware of wood",
    "4420":"Wood marquetry/inlaid wood","4421":"Other articles of wood",
    # Chapter 47 — Pulp
    "4701":"Mechanical wood pulp","4702":"Chemical wood pulp, dissolving",
    "4703":"Chemical wood pulp, soda/sulphate","4704":"Chemical wood pulp, sulphite",
    "4705":"Semi-chemical wood pulp","4706":"Pulp of fibrous cellulosic material",
    "4707":"Recovered paper/paperboard",
    # Chapter 48 — Paper
    "4801":"Newsprint","4802":"Uncoated paper/paperboard",
    "4803":"Toilet/facial tissue paper","4804":"Uncoated kraft paper",
    "4805":"Other uncoated paper","4806":"Vegetable parchment",
    "4807":"Composite paper/paperboard","4808":"Corrugated paper",
    "4809":"Carbon paper","4810":"Coated paper/paperboard",
    "4811":"Other coated paper","4812":"Filter blocks of paper pulp",
    "4813":"Cigarette paper","4814":"Wallpaper","4815":"Floor coverings on base of paper",
    "4816":"Carbon paper, copying paper","4817":"Envelopes of paper",
    "4818":"Toilet paper/tissue","4819":"Cartons/boxes of paper",
    "4820":"Registers/account books of paper","4821":"Labels of paper",
    "4822":"Bobbins/spools of paper","4823":"Other paper/paperboard articles",
    # Chapter 52 — Cotton
    "5201":"Cotton, not carded/combed","5202":"Cotton waste",
    "5203":"Cotton, carded/combed","5204":"Cotton sewing thread",
    "5205":"Cotton yarn (> 85%), single","5206":"Cotton yarn (> 85%), multiple",
    "5207":"Cotton yarn (< 85%)","5208":"Woven fabrics of cotton (≤ 200g/m²)",
    "5209":"Woven fabrics of cotton (> 200g/m²)","5210":"Woven cotton (< 85%, ≤ 200g/m²)",
    "5211":"Woven cotton (< 85%, > 200g/m²)","5212":"Other woven fabrics of cotton",
    # Chapter 61-62 — Apparel
    "6101":"Men's overcoats, knitted","6102":"Women's overcoats, knitted",
    "6103":"Men's suits/jackets, knitted","6104":"Women's suits/dresses, knitted",
    "6105":"Men's shirts, knitted","6106":"Women's blouses, knitted",
    "6107":"Men's underpants/nightwear, knitted","6108":"Women's underpants/nightwear, knitted",
    "6109":"T-shirts, knitted","6110":"Jerseys/pullovers, knitted",
    "6111":"Babies' garments, knitted","6112":"Track suits, knitted",
    "6113":"Garments of rubberized textile","6114":"Other garments, knitted",
    "6115":"Panty hose/stockings, knitted","6116":"Gloves, knitted",
    "6117":"Other clothing accessories, knitted",
    "6201":"Men's overcoats, woven","6202":"Women's overcoats, woven",
    "6203":"Men's suits/jackets, woven","6204":"Women's suits/dresses, woven",
    "6205":"Men's shirts, woven","6206":"Women's blouses, woven",
    "6207":"Men's underpants/nightwear, woven","6208":"Women's underpants/nightwear, woven",
    "6209":"Babies' garments, woven","6210":"Garments of felt/nonwovens",
    "6211":"Track suits, woven","6212":"Brassieres/girdles, woven",
    "6213":"Handkerchiefs","6214":"Shawls/scarves","6215":"Ties/bow ties",
    "6216":"Gloves/mittens, woven","6217":"Other clothing accessories, woven",
    # Chapter 72 — Iron and steel
    "7201":"Pig iron","7202":"Ferro-alloys","7203":"Ferrous products by direct reduction",
    "7204":"Ferrous waste and scrap","7205":"Granules/powders of pig iron",
    "7206":"Iron and non-alloy steel, ingots","7207":"Semi-finished products of iron",
    "7208":"Flat-rolled products, iron, ≥ 600mm, hot-rolled",
    "7209":"Flat-rolled products, iron, ≥ 600mm, cold-rolled",
    "7210":"Flat-rolled products, iron, ≥ 600mm, clad/plated",
    "7211":"Flat-rolled products, iron, < 600mm",
    "7212":"Flat-rolled products, iron, < 600mm, clad",
    "7213":"Bars/rods, iron, hot-rolled, coils","7214":"Bars/rods, iron, not further worked",
    "7215":"Other bars/rods of iron","7216":"Angles/shapes/sections of iron",
    "7217":"Wire of iron","7218":"Stainless steel, ingots",
    "7219":"Flat-rolled stainless, ≥ 600mm","7220":"Flat-rolled stainless, < 600mm",
    "7221":"Bars/rods of stainless steel, coils","7222":"Other bars/rods of stainless steel",
    "7223":"Wire of stainless steel","7224":"Other alloy steel, ingots",
    "7225":"Flat-rolled alloy steel, ≥ 600mm","7226":"Flat-rolled alloy steel, < 600mm",
    "7227":"Bars/rods of alloy steel, coils","7228":"Other bars/rods of alloy steel",
    "7229":"Wire of alloy steel",
    # Chapter 73 — Articles of iron/steel
    "7301":"Sheet piling","7302":"Railway track material",
    "7303":"Tubes/pipes of cast iron","7304":"Tubes/pipes of iron, seamless",
    "7305":"Other tubes/pipes of iron, ≥ 406mm","7306":"Other tubes/pipes of iron",
    "7307":"Tube/pipe fittings","7308":"Structures of iron/steel",
    "7309":"Reservoirs/tanks of iron","7310":"Containers of iron",
    "7311":"Compressed gas containers of iron","7312":"Stranded wire/cables of iron",
    "7313":"Barbed wire of iron","7314":"Cloth/grill/netting of iron",
    "7315":"Chain and parts of iron","7316":"Anchors/grapnels of iron",
    "7317":"Nails/tacks/staples of iron","7318":"Bolts/nuts/screws of iron",
    "7319":"Sewing needles/knitting needles of iron","7320":"Springs of iron",
    "7321":"Stoves/ranges/cookers of iron","7322":"Radiators/central heating of iron",
    "7323":"Table/kitchen articles of iron","7324":"Sanitary ware of iron",
    "7325":"Other cast articles of iron","7326":"Other articles of iron/steel",
    # Chapter 74 — Copper
    "7401":"Copper mattes","7402":"Unrefined copper","7403":"Refined copper",
    "7404":"Copper waste and scrap","7405":"Master alloys of copper",
    "7406":"Powders/flakes of copper","7407":"Copper bars/rods",
    "7408":"Copper wire","7409":"Copper plates/sheets",
    "7410":"Copper foil","7411":"Copper tubes/pipes","7412":"Copper tube fittings",
    "7413":"Stranded wire/cables of copper","7418":"Table/kitchen articles of copper",
    "7419":"Other articles of copper",
    # Chapter 76 — Aluminium
    "7601":"Unwrought aluminium","7602":"Aluminium waste and scrap",
    "7603":"Aluminium powders/flakes","7604":"Aluminium bars/rods",
    "7605":"Aluminium wire","7606":"Aluminium plates/sheets",
    "7607":"Aluminium foil","7608":"Aluminium tubes/pipes",
    "7609":"Aluminium tube fittings","7610":"Aluminium structures",
    "7611":"Aluminium reservoirs","7612":"Aluminium containers",
    "7613":"Compressed gas containers of aluminium","7614":"Stranded wire of aluminium",
    "7615":"Table/kitchen articles of aluminium","7616":"Other articles of aluminium",
    # Chapter 84 — Machinery
    "8401":"Nuclear reactors","8402":"Steam/vapour generating boilers",
    "8403":"Central heating boilers","8404":"Auxiliary plant for boilers",
    "8405":"Producer gas generators","8406":"Steam turbines",
    "8407":"Spark-ignition reciprocating engines","8408":"Compression-ignition engines",
    "8409":"Parts for engines 8407/8408","8410":"Hydraulic turbines",
    "8411":"Turbo-jets and turbo-propellers","8412":"Other engines and motors",
    "8413":"Pumps for liquids","8414":"Air/vacuum pumps and fans",
    "8415":"Air conditioning machines","8416":"Furnace burners",
    "8417":"Industrial/laboratory furnaces","8418":"Refrigerators/freezers",
    "8419":"Machinery for heating/cooling","8420":"Calendering machines",
    "8421":"Centrifuges/filtering apparatus","8422":"Dishwashing/cleaning machines",
    "8423":"Weighing machinery","8424":"Mechanical appliances for spraying",
    "8425":"Pulley tackle/hoists/jacks","8426":"Ships' derricks/cranes",
    "8427":"Fork-lift trucks","8428":"Other lifting/moving machinery",
    "8429":"Self-propelled bulldozers","8430":"Other moving/grading machinery",
    "8431":"Parts for machinery 8425-8430","8432":"Agricultural machinery for soil prep",
    "8433":"Harvesting/threshing machinery","8434":"Milking machines",
    "8435":"Presses for wine/cider","8436":"Other agricultural machinery",
    "8437":"Machines for cleaning/sorting seed","8438":"Machinery for food preparation",
    "8439":"Machinery for papermaking","8440":"Book-binding machinery",
    "8441":"Other machinery for paper pulp","8442":"Machinery for typesetting",
    "8443":"Printing machinery","8444":"Machines for extruding/drawing/texturing man-made textile fibres",
    "8445":"Textile fibre preparation machines","8446":"Weaving machines (looms)",
    "8447":"Knitting machines","8448":"Auxiliary machinery for weaving/knitting",
    "8449":"Machinery for making felt/nonwovens","8450":"Household washing machines",
    "8451":"Machinery for washing/drying textiles","8452":"Sewing machines",
    "8453":"Machinery for leather/furskin","8454":"Converters/ladles for metallurgy",
    "8455":"Metal-rolling mills","8456":"Machine tools (laser/other beam)",
    "8457":"Machining centres for metal","8458":"Lathes for metal",
    "8459":"Machine tools for drilling/boring metal","8460":"Machine tools for deburring metal",
    "8461":"Machine tools for planing/slotting metal","8462":"Machine tools for forging/stamping",
    "8463":"Other machine tools for metals","8464":"Machine tools for stone/ceramics",
    "8465":"Machine tools for wood/cork/plastics","8466":"Parts for machine tools",
    "8467":"Tools for working in hand","8468":"Machinery for soldering/brazing",
    "8469":"Word processing machines","8470":"Calculating machines/cash registers",
    "8471":"Automatic data processing machines (computers)",
    "8472":"Other office machines","8473":"Parts for office machines",
    "8474":"Machinery for sorting/mixing minerals","8475":"Machines for assembling electric lamps",
    "8476":"Automatic goods-vending machines","8477":"Machinery for rubber/plastics",
    "8478":"Machinery for tobacco","8479":"Other machines/mechanical appliances",
    "8480":"Moulding boxes for metal foundry","8481":"Taps, cocks, valves for pipes",
    "8482":"Ball/roller bearings","8483":"Transmission shafts and cranks",
    "8484":"Gaskets and seals","8485":"Machinery parts (additive manufacturing)",
    "8486":"Machines for semiconductor manufacturing","8487":"Other machinery parts",
    # Chapter 85 — Electrical equipment
    "8501":"Electric motors and generators","8502":"Electric generating sets",
    "8503":"Parts for electric motors/generators","8504":"Electrical transformers",
    "8505":"Electromagnets","8506":"Primary cells and batteries",
    "8507":"Electric accumulators (batteries)","8508":"Vacuum cleaners",
    "8509":"Electromechanical domestic appliances","8510":"Shavers/hair clippers",
    "8511":"Electrical ignition equipment","8512":"Electrical lighting for vehicles",
    "8513":"Portable electric lamps","8514":"Industrial electric furnaces",
    "8515":"Electric soldering/brazing machines","8516":"Electric water heaters/hair dryers",
    "8517":"Telephone sets and smartphones",
    "8518":"Microphones and loudspeakers","8519":"Sound recording apparatus",
    "8520":"Magnetic tape recorders","8521":"Video recording apparatus",
    "8522":"Parts for sound/video equipment","8523":"Media for recording",
    "8524":"Flat panel display modules","8525":"Transmission apparatus for radio/TV",
    "8526":"Radar/radio navigation apparatus","8527":"Radio receivers",
    "8528":"Monitors and projectors","8529":"Parts for TV/radio apparatus",
    "8530":"Electrical signalling apparatus (railways)","8531":"Electric sound/visual signalling apparatus",
    "8532":"Electrical capacitors","8533":"Electrical resistors",
    "8534":"Printed circuits","8535":"Electrical apparatus for switching (> 1000V)",
    "8536":"Electrical apparatus for switching (≤ 1000V)","8537":"Boards/panels for electrical control",
    "8538":"Parts for switching apparatus","8539":"Electric filament/discharge lamps",
    "8540":"Thermionic/cold cathode valves","8541":"Semiconductor devices/diodes",
    "8542":"Electronic integrated circuits","8543":"Other electrical machines",
    "8544":"Insulated wire/cable","8545":"Carbon electrodes",
    "8546":"Electrical insulators","8547":"Insulating fittings",
    "8548":"Waste of electric/electronic components","8549":"Electrical/electronic waste",
    # Chapter 86-89 — Vehicles/aircraft/vessels
    "8601":"Rail locomotives, electric","8602":"Other rail locomotives",
    "8603":"Self-propelled railway cars","8604":"Railway maintenance vehicles",
    "8605":"Railway passenger coaches","8606":"Railway freight cars",
    "8607":"Parts of railway rolling stock","8608":"Railway track fixtures",
    "8609":"Containers for transport",
    "8701":"Tractors","8702":"Motor vehicles for ≥ 10 persons",
    "8703":"Motor vehicles for transport of persons",
    "8704":"Motor vehicles for goods transport","8705":"Special purpose motor vehicles",
    "8706":"Chassis fitted with engines","8707":"Bodies for motor vehicles",
    "8708":"Parts and accessories for motor vehicles",
    "8709":"Works trucks, self-propelled","8710":"Tanks and armoured fighting vehicles",
    "8711":"Motorcycles","8712":"Bicycles","8713":"Invalid carriages",
    "8714":"Parts for motorcycles/bicycles","8715":"Baby carriages",
    "8716":"Trailers and semi-trailers",
    "8801":"Balloons and dirigibles","8802":"Aircraft",
    "8803":"Parts of aircraft","8804":"Parachutes","8805":"Aircraft launching gear",
    "8806":"Unmanned aircraft","8807":"Parts for unmanned aircraft",
    "8901":"Cruise ships and cargo vessels","8902":"Fishing vessels",
    "8903":"Yachts and pleasure craft","8904":"Tugs and pusher craft",
    "8905":"Light-vessels, dredgers","8906":"Other vessels",
    "8907":"Other floating structures","8908":"Vessels for breaking up",
    # Chapter 90 — Instruments
    "9001":"Optical fibres","9002":"Lenses/prisms/mirrors","9003":"Frames for spectacles",
    "9004":"Spectacles/goggles","9005":"Binoculars/telescopes",
    "9006":"Photographic cameras","9007":"Cinematographic cameras",
    "9008":"Image projectors","9010":"Apparatus for photo labs",
    "9011":"Compound optical microscopes","9012":"Other microscopes",
    "9013":"Liquid crystal devices/lasers","9014":"Direction finding compasses",
    "9015":"Surveying instruments","9016":"Balances of ≤ 5 cg sensitivity",
    "9017":"Drawing/marking instruments","9018":"Medical/surgical instruments",
    "9019":"Mechano-therapy/massage apparatus","9020":"Breathing appliances",
    "9021":"Orthopaedic appliances","9022":"X-ray apparatus",
    "9023":"Instruments for demonstrations","9024":"Machines for testing materials",
    "9025":"Hydrometers/thermometers","9026":"Instruments for measuring flow/level",
    "9027":"Instruments for physical/chemical analysis",
    "9028":"Gas/liquid/electricity supply meters","9029":"Revolution counters/speedometers",
    "9030":"Oscilloscopes/spectrum analysers","9031":"Measuring/checking instruments",
    "9032":"Automatic regulating instruments","9033":"Parts for instruments ch.90",
    # Chapter 94 — Furniture
    "9401":"Seats","9402":"Medical/dental/surgical furniture",
    "9403":"Other furniture","9404":"Mattress supports","9405":"Lamps and lighting fittings",
    "9406":"Prefabricated buildings",
    # Chapter 95 — Toys
    "9501":"Wheeled toys for children","9502":"Dolls","9503":"Other toys/scale models",
    "9504":"Video game consoles and machines","9505":"Festive/carnival articles",
    "9506":"Sports equipment","9507":"Fishing tackle","9508":"Roundabouts",
    # Chapter 96 — Miscellaneous
    "9601":"Worked ivory/bone/shell","9602":"Worked vegetable/mineral carving material",
    "9603":"Brooms/brushes","9604":"Hand sieves","9605":"Travel sets",
    "9606":"Buttons","9607":"Slide fasteners (zippers)","9608":"Ball point pens",
    "9609":"Pencils","9610":"Slates/boards for writing","9611":"Date/sealing stamps",
    "9612":"Typewriter ribbons","9613":"Cigarette lighters",
    "9614":"Smoking pipes","9615":"Combs/hair slides","9616":"Scent sprays",
    "9617":"Vacuum flasks","9618":"Tailors' dummies","9619":"Sanitary pads/nappies",
    "9620":"Monopods/bipods/tripods",
}

# ─── Generic description terms that need enrichment ───────────────────────────
GENERIC = {"Other", "New", "other", "new", "-", "--", "---", "Other:", "", "N/A"}


def enrich(code: str, desc: str, hs4_map: dict, hs6_map: dict) -> str:
    """Return enriched description for generic entries."""
    desc_clean = desc.strip()
    if desc_clean not in GENERIC and len(desc_clean) > 4:
        return desc

    digits = code.replace(".", "")
    hs4 = digits[:4]
    hs6 = digits[:6]

    # Priority 1: WCO HS4 heading name
    heading = HS4_HEADINGS.get(hs4)

    # Priority 2: Best sibling desc within same HS6
    sib6 = hs6_map.get(hs6)

    # Priority 3: Best sibling desc within same HS4
    sib4 = hs4_map.get(hs4)

    if heading:
        if desc_clean in GENERIC and desc_clean:
            return f"{heading} — {desc_clean}"
        return heading
    elif sib6:
        return f"{sib6[:50]} — {desc_clean}" if desc_clean else sib6[:60]
    elif sib4:
        return f"{sib4[:50]} — {desc_clean}" if desc_clean else sib4[:60]

    return desc  # No enrichment available


def main():
    print("Loading tariff.json…")
    with open(TARIFF) as f:
        data = json.load(f)

    # Build HS4 and HS6 maps of best non-generic descriptions
    hs4_map: dict[str, str] = {}
    hs6_map: dict[str, str] = {}

    for r in data:
        desc = r["d"].strip()
        if desc in GENERIC or len(desc) <= 4:
            continue
        digits = r["h"].replace(".", "")
        hs4 = digits[:4]
        hs6 = digits[:6]
        # Prefer shorter descriptions (closer to heading-level, less specific)
        if hs4 not in hs4_map or len(desc) < len(hs4_map[hs4]):
            hs4_map[hs4] = desc
        if hs6 not in hs6_map or len(desc) < len(hs6_map[hs6]):
            hs6_map[hs6] = desc

    # Enrich
    enriched = 0
    wco_used  = 0
    sib_used  = 0

    for r in data:
        original = r["d"].strip()
        if original not in GENERIC and len(original) > 4:
            continue

        digits = r["h"].replace(".", "")
        hs4 = digits[:4]
        hs6 = digits[:6]
        heading = HS4_HEADINGS.get(hs4)
        sib6 = hs6_map.get(hs6)
        sib4 = hs4_map.get(hs4)

        if heading:
            r["d"] = f"{heading} — {original}" if original else heading
            wco_used += 1
            enriched += 1
        elif sib6:
            r["d"] = f"{sib6[:50]} — {original}" if original else sib6[:60]
            sib_used += 1
            enriched += 1
        elif sib4:
            r["d"] = f"{sib4[:50]} — {original}" if original else sib4[:60]
            sib_used += 1
            enriched += 1
        # else: leave as-is (no context available)

    print(f"Enriched: {enriched:,} descriptions")
    print(f"  Via WCO HS4 heading:  {wco_used:,}")
    print(f"  Via sibling desc:     {sib_used:,}")

    with open(TARIFF, "w") as f:
        json.dump(data, f, separators=(",", ":"))

    kb = TARIFF.stat().st_size // 1024
    print(f"✓ Written {len(data):,} codes to tariff.json  ({kb} KB)")

    # Show samples
    print("\nSample enriched codes:")
    samples = [r for r in data if " — " in r["d"]][:8]
    for r in samples:
        print(f"  {r['h']}  {r['d'][:70]}")


if __name__ == "__main__":
    main()
