const stripe = Stripe("pk_test_XXXXXXXXXXXXXX"); // استخدم المفتاح العام بتاعك
const elements = stripe.elements();
const card = elements.create("card");
card.mount("#card-element");

const form = document.getElementById("payment-form");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const { paymentMethod, error } = await stripe.createPaymentMethod({
    type: "card",
    card: card,
  });

  if (error) {
    document.getElementById("payment-message").innerText = error.message;
    return;
  }

  const response = await fetch("/api/payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: 14900,
      paymentMethodId: paymentMethod.id,
    }),
  });

  const result = await response.json();

  if (result.success) {
    document.getElementById("payment-message").innerText = "تم الدفع بنجاح 🎉";
  } else {
    document.getElementById("payment-message").innerText = result.error;
  }
});
