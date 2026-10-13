// Hand-written names for Hindi and Gujarati: signs, planets, Panchang terms, timings,
// festivals, colours and cities. Sanskrit names are written once in Devanagari and
// converted to Gujarati script; Gujarati gets its own spelling wherever everyday
// Gujarati differs (મંગળ, કાળ, ચલ, દિવાળી, the Gujarati month names, cities ...).

// Names identical in Hindi and Gujarati apart from the script.
const NAMES = {
  // Signs (English and Sanskrit both map to the Indian name)
  Aries: 'मेष', Mesha: 'मेष', Taurus: 'वृषभ', Vrishabha: 'वृषभ', Gemini: 'मिथुन', Mithuna: 'मिथुन',
  Cancer: 'कर्क', Karka: 'कर्क', Leo: 'सिंह', Simha: 'सिंह', Virgo: 'कन्या', Kanya: 'कन्या',
  Libra: 'तुला', Tula: 'तुला', Scorpio: 'वृश्चिक', Vrishchika: 'वृश्चिक', Sagittarius: 'धनु', Dhanu: 'धनु',
  Capricorn: 'मकर', Makara: 'मकर', Aquarius: 'कुंभ', Kumbha: 'कुंभ', Pisces: 'मीन', Meena: 'मीन',
  // Planets
  Sun: 'सूर्य', Moon: 'चंद्र', Mercury: 'बुध', Jupiter: 'गुरु', Venus: 'शुक्र', Saturn: 'शनि', Rahu: 'राहु', Ketu: 'केतु',
  // Nakshatras
  Ashwini: 'अश्विनी', Bharani: 'भरणी', Krittika: 'कृत्तिका', Rohini: 'रोहिणी', Mrigashira: 'मृगशिरा', Ardra: 'आर्द्रा',
  Punarvasu: 'पुनर्वसु', Pushya: 'पुष्य', Ashlesha: 'आश्लेषा', Magha: 'मघा', 'Purva Phalguni': 'पूर्वा फाल्गुनी',
  'Uttara Phalguni': 'उत्तरा फाल्गुनी', Hasta: 'हस्त', Chitra: 'चित्रा', Swati: 'स्वाति', Vishakha: 'विशाखा',
  Anuradha: 'अनुराधा', Jyeshtha: 'ज्येष्ठा', Mula: 'मूल', 'Purva Ashadha': 'पूर्वाषाढ़ा', 'Uttara Ashadha': 'उत्तराषाढ़ा',
  Shravana: 'श्रवण', Dhanishta: 'धनिष्ठा', Shatabhisha: 'शतभिषा', 'Purva Bhadrapada': 'पूर्वा भाद्रपद',
  'Uttara Bhadrapada': 'उत्तरा भाद्रपद', Revati: 'रेवती',
  // Tithis and paksha
  Pratipada: 'प्रतिपदा', Dwitiya: 'द्वितीया', Tritiya: 'तृतीया', Chaturthi: 'चतुर्थी', Panchami: 'पंचमी', Shashthi: 'षष्ठी',
  Saptami: 'सप्तमी', Ashtami: 'अष्टमी', Navami: 'नवमी', Dashami: 'दशमी', Ekadashi: 'एकादशी', Dwadashi: 'द्वादशी',
  Trayodashi: 'त्रयोदशी', Chaturdashi: 'चतुर्दशी', Shukla: 'शुक्ल', Krishna: 'कृष्ण',
  Nanda: 'नंदा', Bhadra: 'भद्रा', Jaya: 'जया', Rikta: 'रिक्ता', Purna: 'पूर्णा',
  // Yogas
  Vishkambha: 'विष्कुंभ', Priti: 'प्रीति', Ayushman: 'आयुष्मान', Saubhagya: 'सौभाग्य', Shobhana: 'शोभन', Atiganda: 'अतिगंड',
  Sukarma: 'सुकर्मा', Dhriti: 'धृति', Shula: 'शूल', Ganda: 'गंड', Vriddhi: 'वृद्धि', Dhruva: 'ध्रुव', Vyaghata: 'व्याघात',
  Harshana: 'हर्षण', Vajra: 'वज्र', Siddhi: 'सिद्धि', Vyatipata: 'व्यतीपात', Variyana: 'वरीयान', Parigha: 'परिघ',
  Shiva: 'शिव', Siddha: 'सिद्ध', Sadhya: 'साध्य', Shubha: 'शुभ', Brahma: 'ब्रह्म', Indra: 'इंद्र', Vaidhriti: 'वैधृति',
  // Karanas
  Bava: 'बव', Balava: 'बालव', Kaulava: 'कौलव', Taitila: 'तैतिल', Garaja: 'गर', Vanija: 'वणिज', Vishti: 'विष्टि',
  Kimstughna: 'किंस्तुघ्न', Shakuni: 'शकुनि', Chatushpada: 'चतुष्पद', Naga: 'नाग',
  // Weekdays (Sanskrit names)
  Ravivara: 'रविवार', Somavara: 'सोमवार', Budhavara: 'बुधवार', Guruvara: 'गुरुवार', Shukravara: 'शुक्रवार', Shanivara: 'शनिवार',
  Sunday: 'रविवार', Monday: 'सोमवार', Wednesday: 'बुधवार', Thursday: 'गुरुवार', Friday: 'शुक्रवार', Saturday: 'शनिवार',
  // Choghadiya, Tara, muhurtas
  Amrit: 'अमृत', Shubh: 'शुभ', Labh: 'लाभ', Rog: 'रोग', Udveg: 'उद्वेग',
  Janma: 'जन्म', Sampat: 'संपत', Vipat: 'विपत', Kshema: 'क्षेम', Pratyari: 'प्रत्यरि', Sadhana: 'साधक', Naidhana: 'नैधन',
  Mitra: 'मित्र', 'Param Mitra': 'परम मित्र', Tara: 'तारा',
  Yamaganda: 'यमगंड', 'Dur Muhurtam': 'दुर्मुहूर्त', 'Brahma Muhurta': 'ब्रह्म मुहूर्त', 'Abhijit Muhurta': 'अभिजीत मुहूर्त',
  'Abhijit Muhurat': 'अभिजीत मुहूर्त', 'Vijaya Muhurta': 'विजय मुहूर्त', 'Godhuli Muhurta': 'गोधूलि मुहूर्त',
  'Pratah Sandhya': 'प्रातः संध्या', 'Sayahna Sandhya': 'सायाह्न संध्या', 'Nishita Muhurta': 'निशीथ मुहूर्त',
  'Bhadra (Vishti)': 'भद्रा (विष्टि)', 'Bhadra (Vishti Karana)': 'भद्रा (विष्टि करण)', Panchak: 'पंचक',
  // Seasons, ayana, samvat
  Vasanta: 'वसंत', Grishma: 'ग्रीष्म', Varsha: 'वर्षा', Sharad: 'शरद', Hemanta: 'हेमंत', Shishira: 'शिशिर',
  Uttarayana: 'उत्तरायण', Dakshinayana: 'दक्षिणायन', Lahiri: 'लाहिड़ी', '(Adhika)': '(अधिक)',
  // Matching
  Varna: 'वर्ण', Vashya: 'वश्य', Yoni: 'योनि', 'Graha Maitri': 'ग्रह मैत्री', Gana: 'गण', Bhakoot: 'भकूट',
  Deva: 'देव', Manushya: 'मनुष्य', Rakshasa: 'राक्षस', Brahmin: 'ब्राह्मण', Kshatriya: 'क्षत्रिय', Vaishya: 'वैश्य', Shudra: 'शूद्र',
  Adi: 'आदि', Madhya: 'मध्य', Antya: 'अंत्य',
  // Festivals (shared forms)
  'Ram Navami': 'राम नवमी', 'Hanuman Jayanti': 'हनुमान जयंती', 'Akshaya Tritiya': 'अक्षय तृतीया',
  'Devshayani Ekadashi': 'देवशयनी एकादशी', 'Guru Purnima': 'गुरु पूर्णिमा', 'Nag Panchami': 'नाग पंचमी',
  'Raksha Bandhan': 'रक्षाबंधन', Janmashtami: 'जन्माष्टमी', 'Ganesh Chaturthi': 'गणेश चतुर्थी',
  'Chhath Puja': 'छठ पूजा', 'Dev Uthani Ekadashi': 'देवउठनी एकादशी', 'Vasant Panchami': 'वसंत पंचमी',
  'Maha Shivaratri': 'महाशिवरात्रि', 'Sankashti Chaturthi': 'संकष्टी चतुर्थी',
  'Shukla Ekadashi (fasting day)': 'शुक्ल एकादशी (व्रत)', 'Krishna Ekadashi (fasting day)': 'कृष्ण एकादशी (व्रत)',
  'Shukla Trayodashi (Pradosh)': 'शुक्ल त्रयोदशी (प्रदोष)', 'Krishna Trayodashi (Pradosh)': 'कृष्ण त्रयोदशी (प्रदोष)',
  'Heart line (Hriday rekha)': 'हृदय रेखा', 'Head line (Mastishk rekha)': 'मस्तिष्क रेखा', 'Life line (Jeevan rekha)': 'जीवन रेखा',
  'Fate line (Bhagya rekha)': 'भाग्य रेखा', 'Sun line (Surya rekha)': 'सूर्य रेखा',
};

const HI = {
  Mars: 'मंगल', Tuesday: 'मंगलवार', Mangalavara: 'मंगलवार', Char: 'चर', Kaal: 'काल',
  'Rahu Kaal': 'राहु काल', 'Gulika Kaal': 'गुलिक काल',
  Purnima: 'पूर्णिमा', Amavasya: 'अमावस्या', 'Purnima (full moon)': 'पूर्णिमा', 'Amavasya (new moon)': 'अमावस्या',
  'Chaitra (month)': 'चैत्र', 'Vaishakha (month)': 'वैशाख', 'Jyeshtha (month)': 'ज्येष्ठ', 'Ashadha (month)': 'आषाढ़',
  'Shravana (month)': 'श्रावण', 'Bhadrapada (month)': 'भाद्रपद', 'Ashwin (month)': 'आश्विन', 'Kartik (month)': 'कार्तिक',
  'Margashirsha (month)': 'मार्गशीर्ष', 'Pausha (month)': 'पौष', 'Magha (month)': 'माघ', 'Phalguna (month)': 'फाल्गुन',
  'Gudi Padwa / Ugadi, Chaitra Navratri begins': 'गुड़ी पड़वा / उगादि, चैत्र नवरात्रि आरंभ',
  'Sarva Pitru Amavasya': 'सर्वपितृ अमावस्या', 'Dussehra (Vijayadashami)': 'दशहरा (विजयादशमी)', 'Sharad Purnima': 'शरद पूर्णिमा',
  'Karwa Chauth': 'करवा चौथ', Dhanteras: 'धनतेरस', 'Narak Chaturdashi': 'नरक चतुर्दशी', 'Diwali (Lakshmi Puja)': 'दिवाली (लक्ष्मी पूजा)',
  'Govardhan Puja / Gujarati New Year': 'गोवर्धन पूजा / गुजराती नव वर्ष', 'Bhai Dooj': 'भाई दूज',
  'Kartik Purnima / Dev Diwali': 'कार्तिक पूर्णिमा / देव दिवाली', 'Holika Dahan': 'होलिका दहन',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [`Sharad Navratri day ${d}`, `शारदीय नवरात्रि, दिन ${d}`])),
  // Qualities and ratings
  best: 'सर्वश्रेष्ठ', good: 'शुभ', neutral: 'सामान्य', bad: 'अशुभ', mixed: 'मिश्रित', excellent: 'उत्तम', average: 'सामान्य', avoid: 'टालें',
  'Strong day': 'मज़बूत दिन', 'Good day': 'अच्छा दिन', 'Mixed day': 'मिला-जुला दिन', 'Cautious day': 'सावधानी का दिन',
  'Rising (1st phase)': 'पहला चरण (आरंभ)', 'Peak (2nd phase)': 'दूसरा चरण (मध्य)', 'Setting (3rd phase)': 'तीसरा चरण (अंत)',
  'Not Manglik': 'मांगलिक नहीं', 'Mild (Anshik) Manglik': 'आंशिक मांगलिक',
  // Timing notes
  'Avoid starting new work, travel, purchases': 'नया काम, यात्रा और खरीदारी शुरू करने से बचें',
  'Inauspicious for new beginnings': 'नई शुरुआत के लिए अशुभ',
  'Whatever starts now tends to repeat; avoid for new work, fine for repeat tasks': 'इस समय शुरू हुआ काम दोहराया जाता है; नए काम से बचें, दोहराने वाले कामों के लिए ठीक',
  'Inauspicious muhurta': 'अशुभ मुहूर्त', 'Meditation, study, prayer': 'ध्यान, पढ़ाई, प्रार्थना',
  'Traditionally skipped on Wednesday': 'परंपरा से बुधवार को नहीं लिया जाता',
  'Most auspicious midday window; good for any important start': 'दोपहर का सबसे शुभ समय; किसी भी ज़रूरी शुरुआत के लिए अच्छा',
  'Good for victory, competitions, legal matters': 'जीत, प्रतियोगिता और कानूनी मामलों के लिए अच्छा',
  'Cow-dust hour; traditional for weddings': 'गोधूलि बेला; विवाह के लिए पारंपरिक',
  'Morning prayer window': 'सुबह की पूजा का समय', 'Evening prayer window': 'शाम की पूजा का समय',
  'Midnight window; Shiva and Kali worship': 'मध्यरात्रि का समय; शिव और काली पूजा',
  'Avoid auspicious ceremonies': 'शुभ संस्कारों से बचें',
  'Government or official work only': 'केवल सरकारी या दफ़्तरी काम', 'Travel, movement': 'यात्रा, आवाजाही',
  'Business, trade, education': 'व्यापार, लेन-देन, शिक्षा', 'All auspicious work': 'सभी शुभ कार्य',
  'Avoid new beginnings': 'नई शुरुआत से बचें', 'Ceremonies, marriage, worship': 'संस्कार, विवाह, पूजा',
  'Avoid; disputes and illness': 'टालें; विवाद और रोग',
  'Government work, meeting authority, health': 'सरकारी काम, अधिकारियों से मिलना, स्वास्थ्य',
  'Travel, meeting people, home matters': 'यात्रा, लोगों से मिलना, घर के काम',
  'Sports, property disputes; avoid agreements': 'खेल, संपत्ति विवाद; समझौतों से बचें',
  'Trade, writing, learning, communication': 'व्यापार, लेखन, पढ़ाई, बातचीत',
  'Ceremonies, finance, teaching, marriage talks': 'संस्कार, धन, पढ़ाना, विवाह की बातचीत',
  'Romance, shopping, arts, new clothes': 'प्रेम, खरीदारी, कला, नए कपड़े',
  'Labour, repairs; avoid new starts': 'मेहनत का काम, मरम्मत; नई शुरुआत से बचें',
  // Matching
  'Work and ego compatibility': 'काम और अहं का मेल', 'Mutual attraction and influence': 'आपसी आकर्षण और प्रभाव',
  'Health and well-being': 'स्वास्थ्य और कुशलता', 'Physical and intimate compatibility': 'शारीरिक और अंतरंग अनुकूलता',
  'Mental compatibility and friendship': 'मानसिक मेल और मित्रता', Temperament: 'स्वभाव',
  'Family welfare and finances': 'परिवार की भलाई और धन', 'Health of progeny and genes': 'संतान का स्वास्थ्य',
  'Nadi Dosha': 'नाड़ी दोष', 'Bhakoot Dosha': 'भकूट दोष', 'Gana Dosha': 'गण दोष', Nadi: 'नाड़ी',
  'Excellent match': 'उत्तम मिलान', 'Very good match': 'बहुत अच्छा मिलान', 'Acceptable match': 'स्वीकार्य मिलान',
  'Not recommended without detailed analysis': 'विस्तृत जाँच के बिना सलाह नहीं',
  // Plans
  Free: 'मुफ़्त', Solo: 'एकल', Couple: 'दंपती', Family: 'परिवार',
  // Colours and elements
  Red: 'लाल', Green: 'हरा', Black: 'काला', Blue: 'नीला', Yellow: 'पीला', White: 'सफ़ेद', Cream: 'क्रीम', Pink: 'गुलाबी',
  Purple: 'बैंगनी', Orange: 'नारंगी', 'Light blue': 'आसमानी', Grey: 'स्लेटी', Gold: 'सुनहरा', Silver: 'चाँदी', Coral: 'मूंगा',
  Emerald: 'पन्ना', Saffron: 'केसरिया', Wood: 'काष्ठ', Fire: 'अग्नि', Earth: 'पृथ्वी', Metal: 'धातु', Water: 'जल', Air: 'वायु',
  // Cities
  Mumbai: 'मुंबई', Delhi: 'दिल्ली', Bengaluru: 'बेंगलुरु', Hyderabad: 'हैदराबाद', Ahmedabad: 'अहमदाबाद', Chennai: 'चेन्नई',
  Kolkata: 'कोलकाता', Surat: 'सूरत', Pune: 'पुणे', Jaipur: 'जयपुर', Lucknow: 'लखनऊ', Vadodara: 'वडोदरा', Rajkot: 'राजकोट',
  Indore: 'इंदौर', Bhopal: 'भोपाल', Patna: 'पटना', Varanasi: 'वाराणसी', Nagpur: 'नागपुर', Kochi: 'कोच्चि', Chandigarh: 'चंडीगढ़',
  Kathmandu: 'काठमांडू', Colombo: 'कोलंबो', Dhaka: 'ढाका', Bangkok: 'बैंकॉक', 'Chiang Mai': 'चियांग माई',
  'Ho Chi Minh City': 'हो ची मिन्ह सिटी', Hanoi: 'हनोई', Singapore: 'सिंगापुर', 'Kuala Lumpur': 'कुआलालंपुर', Jakarta: 'जकार्ता',
  'Bali (Denpasar)': 'बाली (देनपसार)', Manila: 'मनीला', Cebu: 'सेबू', 'Phnom Penh': 'नोम पेन्ह', Yangon: 'यांगून', Dubai: 'दुबई',
  London: 'लंदन', 'New York': 'न्यूयॉर्क', Toronto: 'टोरंटो', Sydney: 'सिडनी',
};

const GU = {
  Mars: 'મંગળ', Tuesday: 'મંગળવાર', Mangalavara: 'મંગળવાર', Char: 'ચલ', Kaal: 'કાળ',
  'Rahu Kaal': 'રાહુ કાળ', 'Gulika Kaal': 'ગુલિક કાળ',
  Purnima: 'પૂનમ', Amavasya: 'અમાસ', 'Purnima (full moon)': 'પૂનમ', 'Amavasya (new moon)': 'અમાસ',
  'Purva Ashadha': 'પૂર્વાષાઢા', 'Uttara Ashadha': 'ઉત્તરાષાઢા', Nadi: 'નાડી', Lahiri: 'લાહિરી',
  // Months as Gujarati calendars print them
  'Chaitra (month)': 'ચૈત્ર', 'Vaishakha (month)': 'વૈશાખ', 'Jyeshtha (month)': 'જેઠ', 'Ashadha (month)': 'અષાઢ',
  'Shravana (month)': 'શ્રાવણ', 'Bhadrapada (month)': 'ભાદરવો', 'Ashwin (month)': 'આસો', 'Kartik (month)': 'કારતક',
  'Margashirsha (month)': 'માગશર', 'Pausha (month)': 'પોષ', 'Magha (month)': 'મહા', 'Phalguna (month)': 'ફાગણ',
  'Gudi Padwa / Ugadi, Chaitra Navratri begins': 'ગુડી પડવો / ઉગાદિ, ચૈત્ર નવરાત્રિ પ્રારંભ',
  'Sarva Pitru Amavasya': 'સર્વપિતૃ અમાસ', 'Dussehra (Vijayadashami)': 'દશેરા (વિજયાદશમી)', 'Sharad Purnima': 'શરદ પૂનમ',
  'Karwa Chauth': 'કરવા ચોથ', Dhanteras: 'ધનતેરસ', 'Narak Chaturdashi': 'કાળી ચૌદસ', 'Diwali (Lakshmi Puja)': 'દિવાળી (લક્ષ્મી પૂજન)',
  'Govardhan Puja / Gujarati New Year': 'ગોવર્ધન પૂજા / બેસતું વર્ષ', 'Bhai Dooj': 'ભાઈબીજ',
  'Kartik Purnima / Dev Diwali': 'કારતક પૂનમ / દેવ દિવાળી', 'Holika Dahan': 'હોળિકા દહન', 'Guru Purnima': 'ગુરુ પૂર્ણિમા',
  'Raksha Bandhan': 'રક્ષાબંધન',
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [`Sharad Navratri day ${d}`, `શારદીય નવરાત્રિ, દિવસ ${d}`])),
  'Shukla Ekadashi (fasting day)': 'શુક્લ એકાદશી (ઉપવાસ)', 'Krishna Ekadashi (fasting day)': 'કૃષ્ણ એકાદશી (ઉપવાસ)',
  // Qualities and ratings
  best: 'સર્વશ્રેષ્ઠ', good: 'શુભ', neutral: 'સામાન્ય', bad: 'અશુભ', mixed: 'મિશ્ર', excellent: 'ઉત્તમ', average: 'સામાન્ય', avoid: 'ટાળો',
  'Strong day': 'મજબૂત દિવસ', 'Good day': 'સારો દિવસ', 'Mixed day': 'મિશ્ર દિવસ', 'Cautious day': 'સાવધાનીનો દિવસ',
  'Rising (1st phase)': 'પહેલો તબક્કો (શરૂઆત)', 'Peak (2nd phase)': 'બીજો તબક્કો (મધ્ય)', 'Setting (3rd phase)': 'ત્રીજો તબક્કો (અંત)',
  'Not Manglik': 'માંગલિક નથી', 'Mild (Anshik) Manglik': 'આંશિક માંગલિક',
  // Timing notes
  'Avoid starting new work, travel, purchases': 'નવું કામ, મુસાફરી અને ખરીદી શરૂ કરવાનું ટાળો',
  'Inauspicious for new beginnings': 'નવી શરૂઆત માટે અશુભ',
  'Whatever starts now tends to repeat; avoid for new work, fine for repeat tasks': 'આ સમયે શરૂ થયેલું કામ ફરી ફરી થાય છે; નવા કામ માટે ટાળો, વારંવારનાં કામ માટે ઠીક',
  'Inauspicious muhurta': 'અશુભ મુહૂર્ત', 'Meditation, study, prayer': 'ધ્યાન, અભ્યાસ, પ્રાર્થના',
  'Traditionally skipped on Wednesday': 'પરંપરા મુજબ બુધવારે લેવાતું નથી',
  'Most auspicious midday window; good for any important start': 'બપોરનો સૌથી શુભ સમય; કોઈ પણ મહત્વની શરૂઆત માટે સારો',
  'Good for victory, competitions, legal matters': 'જીત, સ્પર્ધા અને કાનૂની બાબતો માટે સારો',
  'Cow-dust hour; traditional for weddings': 'ગોધૂલિ વેળા; લગ્ન માટે પરંપરાગત',
  'Morning prayer window': 'સવારની પૂજાનો સમય', 'Evening prayer window': 'સાંજની પૂજાનો સમય',
  'Midnight window; Shiva and Kali worship': 'મધ્યરાત્રિનો સમય; શિવ અને કાળી પૂજા',
  'Avoid auspicious ceremonies': 'શુભ પ્રસંગો ટાળો',
  'Government or official work only': 'ફક્ત સરકારી કે ઓફિસનાં કામ', 'Travel, movement': 'મુસાફરી, અવરજવર',
  'Business, trade, education': 'વેપાર, લેવડદેવડ, શિક્ષણ', 'All auspicious work': 'બધાં શુભ કાર્યો',
  'Avoid new beginnings': 'નવી શરૂઆત ટાળો', 'Ceremonies, marriage, worship': 'પ્રસંગો, લગ્ન, પૂજા',
  'Avoid; disputes and illness': 'ટાળો; ઝઘડા અને બીમારી',
  'Government work, meeting authority, health': 'સરકારી કામ, અધિકારીઓને મળવું, આરોગ્ય',
  'Travel, meeting people, home matters': 'મુસાફરી, લોકોને મળવું, ઘરનાં કામ',
  'Sports, property disputes; avoid agreements': 'રમતગમત, મિલકતના વિવાદ; કરાર ટાળો',
  'Trade, writing, learning, communication': 'વેપાર, લેખન, અભ્યાસ, વાતચીત',
  'Ceremonies, finance, teaching, marriage talks': 'પ્રસંગો, નાણાં, ભણાવવું, લગ્નની વાત',
  'Romance, shopping, arts, new clothes': 'પ્રેમ, ખરીદી, કળા, નવાં કપડાં',
  'Labour, repairs; avoid new starts': 'મહેનતનાં કામ, સમારકામ; નવી શરૂઆત ટાળો',
  // Matching
  'Work and ego compatibility': 'કામ અને અહંનો મેળ', 'Mutual attraction and influence': 'પરસ્પર આકર્ષણ અને પ્રભાવ',
  'Health and well-being': 'આરોગ્ય અને સુખાકારી', 'Physical and intimate compatibility': 'શારીરિક અને અંગત અનુકૂળતા',
  'Mental compatibility and friendship': 'માનસિક મેળ અને મિત્રતા', Temperament: 'સ્વભાવ',
  'Family welfare and finances': 'પરિવારનું હિત અને નાણાં', 'Health of progeny and genes': 'સંતાનનું આરોગ્ય',
  'Nadi Dosha': 'નાડી દોષ', 'Bhakoot Dosha': 'ભકૂટ દોષ', 'Gana Dosha': 'ગણ દોષ',
  'Excellent match': 'ઉત્તમ મેળ', 'Very good match': 'ખૂબ સારો મેળ', 'Acceptable match': 'સ્વીકાર્ય મેળ',
  'Not recommended without detailed analysis': 'વિગતવાર તપાસ વગર સલાહભર્યું નથી',
  // Plans
  Free: 'મફત', Solo: 'એકલ', Couple: 'દંપતી', Family: 'પરિવાર',
  // Colours and elements
  Red: 'લાલ', Green: 'લીલો', Black: 'કાળો', Blue: 'વાદળી', Yellow: 'પીળો', White: 'સફેદ', Cream: 'ક્રીમ', Pink: 'ગુલાબી',
  Purple: 'જાંબલી', Orange: 'નારંગી', 'Light blue': 'આસમાની', Grey: 'રાખોડી', Gold: 'સોનેરી', Silver: 'ચાંદી', Coral: 'પરવાળું',
  Emerald: 'પન્ના', Saffron: 'કેસરી', Wood: 'કાષ્ઠ', Fire: 'અગ્નિ', Earth: 'પૃથ્વી', Metal: 'ધાતુ', Water: 'જળ', Air: 'વાયુ',
  // Cities
  Mumbai: 'મુંબઈ', Delhi: 'દિલ્હી', Bengaluru: 'બેંગલુરુ', Hyderabad: 'હૈદરાબાદ', Ahmedabad: 'અમદાવાદ', Chennai: 'ચેન્નઈ',
  Kolkata: 'કોલકાતા', Surat: 'સુરત', Pune: 'પુણે', Jaipur: 'જયપુર', Lucknow: 'લખનૌ', Vadodara: 'વડોદરા', Rajkot: 'રાજકોટ',
  Indore: 'ઇન્દોર', Bhopal: 'ભોપાલ', Patna: 'પટના', Varanasi: 'વારાણસી', Nagpur: 'નાગપુર', Kochi: 'કોચી', Chandigarh: 'ચંડીગઢ',
  Kathmandu: 'કાઠમંડુ', Colombo: 'કોલંબો', Dhaka: 'ઢાકા', Bangkok: 'બેંગકોક', 'Chiang Mai': 'ચિયાંગ માઈ',
  'Ho Chi Minh City': 'હો ચી મિન્હ સિટી', Hanoi: 'હનોઈ', Singapore: 'સિંગાપોર', 'Kuala Lumpur': 'કુઆલાલંપુર', Jakarta: 'જકાર્તા',
  'Bali (Denpasar)': 'બાલી (ડેનપસાર)', Manila: 'મનીલા', Cebu: 'સેબુ', 'Phnom Penh': 'નોમ પેન્હ', Yangon: 'યાંગોન', Dubai: 'દુબઈ',
  London: 'લંડન', 'New York': 'ન્યૂયોર્ક', Toronto: 'ટોરોન્ટો', Sydney: 'સિડની',
};

/** Devanagari to Gujarati script (the Unicode blocks line up; Gujarati drops the nukta). */
export function toGujarati(s) {
  return [...s].map((ch) => {
    const c = ch.codePointAt(0);
    if (c === 0x093c) return ''; // nukta
    if (c === 0x0964 || c === 0x0965) return ch; // danda
    return c >= 0x0900 && c <= 0x097f ? String.fromCodePoint(c + 0x180) : ch;
  }).join('');
}

export const glossaryHi = { ...NAMES, ...HI };
export const glossaryGu = { ...Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [k, toGujarati(v)])), ...GU };
