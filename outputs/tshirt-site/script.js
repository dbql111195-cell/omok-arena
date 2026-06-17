const cartButton = document.querySelector(".cart-button");
const cartPanel = document.querySelector("#cartPanel");
const closeCart = document.querySelector("#closeCart");
const cartCount = document.querySelector("#cartCount");
const cartItems = document.querySelector("#cartItems");
const emptyCart = document.querySelector("#emptyCart");
const addButtons = document.querySelectorAll(".add-cart");

const cart = [];

function formatPrice(price) {
  return `${Number(price).toLocaleString("ko-KR")}원`;
}

function renderCart() {
  cartItems.innerHTML = "";
  cartCount.textContent = cart.length;
  emptyCart.style.display = cart.length ? "none" : "block";

  cart.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${item.name}</span><strong>${formatPrice(item.price)}</strong>`;
    cartItems.appendChild(li);
  });
}

addButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const card = button.closest(".product-card");
    cart.push({
      name: card.dataset.product,
      price: card.dataset.price,
    });

    button.textContent = "담겼어요";
    button.classList.add("added");
    cartPanel.classList.add("open");
    renderCart();

    window.setTimeout(() => {
      button.textContent = "담기";
      button.classList.remove("added");
    }, 1200);
  });
});

cartButton.addEventListener("click", () => {
  cartPanel.classList.toggle("open");
});

closeCart.addEventListener("click", () => {
  cartPanel.classList.remove("open");
});

renderCart();
