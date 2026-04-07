"use strict";

const FIRST_NAMES = [
  // English
  "Sophia", "Emma", "Olivia", "Ava", "Isabella", "Mia", "Charlotte", "Amelia",
  "James", "Robert", "Michael", "William", "David", "Joseph", "Thomas", "Daniel",
  "Grace", "Hannah", "Lily", "Chloe", "Zoe", "Natalie", "Victoria", "Abigail",
  "Noah", "Ethan", "Liam", "Mason", "Logan", "Lucas", "Benjamin", "Henry",
  // Italian
  "Sofia", "Maria", "Elena", "Rosa", "Marco", "Antonio", "Giovanni", "Lucia",
  "Valentina", "Federica", "Alessia", "Martina", "Lorenzo", "Matteo", "Luca", "Chiara",
  // East Asian
  "Li", "Wei", "Ming", "Yuki", "Hana", "Sakura", "Kenji", "Hiroshi",
  "Mei", "Xiao", "Jing", "Rin", "Sota", "Yuna", "Naomi", "Emi",
  // South Asian
  "Priya", "Aisha", "Jasmine", "Amara", "Raj", "Arjun", "Kavya", "Divya",
  "Rohan", "Vikram", "Ananya", "Ishaan", "Meera", "Riya", "Sanjay", "Pooja",
  // Middle Eastern / North African
  "Zara", "Layla", "Nadia", "Fatima", "Omar", "Tariq", "Yasmin", "Leila",
  "Karim", "Hassan", "Salma", "Nour", "Rania", "Amal", "Walid", "Hana",
  // Scandinavian / Irish
  "Ingrid", "Astrid", "Lars", "Freya", "Saoirse", "Niamh", "Cillian", "Maeve",
  "Bjorn", "Sigrid", "Finn", "Erika", "Aoife", "Ciara", "Declan", "Siobhan",
  // French
  "Hugo", "Camille", "Lea", "Baptiste", "Mathilde", "Theo", "Ines", "Louis",
  "Antoine", "Manon", "Romain", "Lucie", "Maxime", "Juliette", "Axel",
  // Spanish / Latin American
  "Valeria", "Santiago", "Catalina", "Sebastian", "Lucia", "Emilio",
  "Gabriela", "Diego", "Fernanda", "Carlos", "Daniela", "Natalia", "Javier",
];

// Hand-crafted Savor recipes — injected ~10% of share cycles
// scrapedWithAI: true + no sourceUrl triggers "Made with Savor" badge in UI
const SAVOR_RECIPES = [
  {
    name: "Mum's Sunday Lamb Stew",
    description: "Transferred from her handwritten recipe card. She made this every winter Sunday.",
    ingredients: [
      "800g lamb shoulder, cut into chunks",
      "3 carrots, chopped", "2 parsnips, chopped", "1 large onion, diced",
      "3 cloves garlic, crushed", "400ml lamb or beef stock",
      "2 tbsp tomato paste", "1 tsp dried rosemary", "1 tsp dried thyme",
      "Salt and pepper", "2 tbsp plain flour", "2 tbsp olive oil",
    ],
    convertedIngredients: [],
    instructions: [
      "Toss lamb in flour seasoned with salt and pepper.",
      "Brown lamb in batches in hot oil until deeply coloured. Set aside.",
      "Sauté onion and garlic 5 minutes until soft.",
      "Add tomato paste, stir 1 minute. Return lamb to pot.",
      "Add stock, herbs, carrots and parsnips. Bring to boil.",
      "Reduce heat, cover, simmer 1.5–2 hours until lamb is very tender.",
      "Season and serve with crusty bread or mashed potato.",
    ],
    category: "Main Course", cuisine: "British", recipeYield: "4 servings",
    times: { cook: { hours: 2, minutes: 0 }, prep: { hours: 0, minutes: 20 }, total: { hours: 2, minutes: 20 } },
    sourceUrl: null, author: null, isFavorite: false, scrapedWithAI: true,
  },
  {
    name: "Proper Dal Tadka",
    description: "Built from memory after eating this nearly every day for a semester.",
    ingredients: [
      "250g red lentils, rinsed", "1 litre water",
      "1 large tomato, chopped", "1 tsp turmeric", "Salt to taste",
      "Tadka: 3 tbsp ghee, 1 tsp cumin seeds, 4 garlic cloves (sliced), 2 dried red chillies, 1 tsp Kashmiri chilli powder",
      "Fresh coriander to finish",
    ],
    convertedIngredients: [],
    instructions: [
      "Simmer lentils with water, tomato and turmeric 20–25 mins until soft. Season well.",
      "Heat ghee in a small pan. Fry cumin seeds until sizzling.",
      "Add garlic and cook until golden. Add dried chillies and chilli powder. Stir 30 seconds.",
      "Pour tadka over dal. Finish with coriander. Serve with rice or roti.",
    ],
    category: "Main Course", cuisine: "Indian", recipeYield: "4 servings",
    times: { cook: { hours: 0, minutes: 30 }, prep: { hours: 0, minutes: 10 }, total: { hours: 0, minutes: 40 } },
    sourceUrl: null, author: null, isFavorite: false, scrapedWithAI: true,
  },
  {
    name: "Chilli Crisp Noodles",
    description: "Scanned from a cookbook page I kept losing. 15-minute weeknight staple.",
    ingredients: [
      "200g dried egg noodles", "3 tbsp chilli crisp oil",
      "2 tbsp soy sauce", "1 tbsp rice vinegar", "1 tsp sesame oil",
      "2 spring onions, sliced", "1 tbsp toasted sesame seeds",
      "Soft-boiled egg (optional)",
    ],
    convertedIngredients: [],
    instructions: [
      "Cook noodles per packet. Drain and rinse cold.",
      "Whisk chilli crisp, soy, vinegar and sesame oil.",
      "Toss noodles through dressing.",
      "Top with spring onions, sesame seeds and egg if using.",
    ],
    category: "Main Course", cuisine: "Asian", recipeYield: "2 servings",
    times: { cook: { hours: 0, minutes: 10 }, prep: { hours: 0, minutes: 5 }, total: { hours: 0, minutes: 15 } },
    sourceUrl: null, author: null, isFavorite: false, scrapedWithAI: true,
  },
  {
    name: "Crispy Smashed Potatoes",
    description: "A side dish I kept losing and remaking from memory. Here permanently now.",
    ingredients: [
      "1kg baby potatoes", "4 tbsp olive oil", "4 cloves garlic, minced",
      "1 tsp smoked paprika", "Salt and pepper",
      "Fresh parsley + flaky salt to finish",
    ],
    convertedIngredients: [],
    instructions: [
      "Boil potatoes in salted water until very tender, ~20 mins. Drain and steam-dry 5 mins.",
      "Preheat oven to 220°C. Oil a large baking tray generously.",
      "Arrange potatoes and smash flat with a glass or fork.",
      "Mix remaining oil with garlic and paprika. Drizzle over. Season.",
      "Roast 25–30 mins flipping once, until deeply golden and crispy.",
      "Finish with parsley and flaky salt.",
    ],
    category: "Side Dish", cuisine: null, recipeYield: "4 servings",
    times: { cook: { hours: 0, minutes: 55 }, prep: { hours: 0, minutes: 5 }, total: { hours: 1, minutes: 0 } },
    sourceUrl: null, author: null, isFavorite: false, scrapedWithAI: true,
  },
  {
    name: "Brown Butter Banana Loaf",
    description: "Torn-out magazine page, finally typed up. Browning the butter is what makes it.",
    ingredients: [
      "115g unsalted butter", "3 very ripe bananas (~300g peeled)",
      "150g caster sugar", "2 large eggs", "1 tsp vanilla extract",
      "190g plain flour", "1 tsp baking soda",
      "½ tsp cinnamon", "¼ tsp salt", "60ml sour cream or buttermilk",
    ],
    convertedIngredients: [],
    instructions: [
      "Preheat oven to 175°C. Grease a 900g loaf tin.",
      "Brown butter in a saucepan over medium heat until golden and nutty, 5–7 mins. Cool slightly.",
      "Mash bananas into butter. Stir in sugar, eggs and vanilla.",
      "Fold in flour, baking soda, cinnamon and salt. Stir in sour cream.",
      "Bake 55–65 minutes. Cool in tin 10 mins before turning out.",
    ],
    category: "Baking", cuisine: null, recipeYield: "1 loaf (10 slices)",
    times: { cook: { hours: 1, minutes: 5 }, prep: { hours: 0, minutes: 15 }, total: { hours: 1, minutes: 20 } },
    sourceUrl: null, author: null, isFavorite: false, scrapedWithAI: true,
  },
];

module.exports = { FIRST_NAMES, SAVOR_RECIPES };
