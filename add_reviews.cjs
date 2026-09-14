const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'server', 'data');
const productsPath = path.join(dataDir, 'products.json');
const reviewsPath = path.join(dataDir, 'reviews.json');

const products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
let reviews = [];
try {
  reviews = JSON.parse(fs.readFileSync(reviewsPath, 'utf-8'));
} catch (e) {
  // ignoring, it might not exist or be empty
}

const indianNames = [
  "Aarav", "Vihaan", "Aditya", "Arjun", "Sai", "Riyansh", "Dhruv", "Krishna", 
  "Ananya", "Diya", "Saanvi", "Myra", "Aadhya", "Pari", "Kavya", "Ishita",
  "Rohan", "Kabir", "Aryan", "Atharv", "Pranav", "Vivaan", "Dev", "Yash",
  "Riya", "Avni", "Sara", "Neha", "Meera", "Zara", "Tara", "Naina",
  "Rahul", "Amit", "Vikram", "Suresh", "Ramesh", "Manoj", "Sanjay", "Raj",
  "Priya", "Sneha", "Pooja", "Shweta", "Kiran", "Anita", "Sunita", "Geeta",
  "Manish", "Deepak", "Akash", "Vikas", "Vishal", "Sumit", "Anil", "Sunil"
];

const positiveTexts = [
  "Really good quality material, feels premium.",
  "Perfect fit, exact size as mentioned in the chart.",
  "Loved the color, looks exactly like the pictures.",
  "Very comfortable to wear all day.",
  "Worth the price. highly recommended!",
  "Fabric is soft and breathable.",
  "Awesome product, arrived on time.",
  "Looks great! I've received many compliments.",
  "Stitching is top notch. Will buy more.",
  "Totally satisfied with the purchase."
];

const neutralTexts = [
  "It's decent for the price, but could be slightly better.",
  "Fits okay, a little loose around the shoulders.",
  "Color is slightly lighter than the picture.",
  "Average quality, good for daily wear.",
  "Not bad, but I expected thicker fabric."
];

const negativeTexts = [
  "Size runs very small, had to exchange.",
  "Didn't like the material, feels a bit synthetic.",
  "After one wash, it shrunk a little.",
  "Not as premium as it looks in the photos."
];

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let existingReviewCount = reviews.length;

// Ensure 20 reviews for each product
for (const product of products) {
  const prodReviews = reviews.filter(r => r.productId === product.id);
  const needed = 20 - prodReviews.length;
  
  for (let i = 0; i < needed; i++) {
    const name = indianNames[getRandomInt(0, indianNames.length - 1)] + " " + indianNames[getRandomInt(0, indianNames.length - 1)].charAt(0) + ".";
    
    // Weighted rating: 
    // 5 stars: 50%
    // 4 stars: 30%
    // 3 stars: 15%
    // 2 stars: 5%
    const rand = Math.random();
    let rating = 5;
    let textOptions = positiveTexts;
    
    if (rand < 0.5) {
      rating = 5;
      textOptions = positiveTexts;
    } else if (rand < 0.8) {
      rating = 4;
      textOptions = positiveTexts;
    } else if (rand < 0.95) {
      rating = 3;
      textOptions = neutralTexts;
    } else {
      rating = 2;
      textOptions = negativeTexts;
    }
    
    const text = textOptions[getRandomInt(0, textOptions.length - 1)];
    
    // Random date within the last 6 months
    const date = new Date(Date.now() - getRandomInt(1, 180) * 24 * 60 * 60 * 1000);
    
    reviews.push({
      id: "rev_" + Math.random().toString(36).substring(2, 9),
      productId: product.id,
      name: name,
      rating: rating,
      text: text,
      createdAt: date.toISOString()
    });
  }
}

// Sort reviews by date descending
reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

fs.writeFileSync(reviewsPath, JSON.stringify(reviews, null, 2));
console.log(`Added ${reviews.length - existingReviewCount} fake Indian reviews. Total reviews: ${reviews.length}`);
