// Mailgun test: sends one email using MAILGUN_DOMAIN and MAILGUN_API_KEY from env.
// Run from api-server directory so .env is loaded next to the binary when using gotenv:
//
//	cd api-server && go run ./cmd/mailgun-test
//
// Or build and run (after loading .env):
//
//	cd api-server && go build -o mailgun-test ./cmd/mailgun-test && ./mailgun-test
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/mailgun/mailgun-go/v4"
	"github.com/subosito/gotenv"
)

func main() {
	_ = gotenv.Load(".env")

	domain := os.Getenv("MAILGUN_DOMAIN")
	apiKey := os.Getenv("MAILGUN_API_KEY")
	to := os.Getenv("MAILGUN_TEST_TO")
	if to == "" {
		to = "lantongkun@gmail.com"
	}

	if domain == "" || apiKey == "" {
		fmt.Fprintln(os.Stderr, "MAILGUN_DOMAIN and MAILGUN_API_KEY are required. Set them in api-server/.env")
		os.Exit(1)
	}

	from := fmt.Sprintf("X-Flow <postmaster@%s>", domain)
	if f := os.Getenv("MAILGUN_FROM"); f != "" {
		from = f
	}

	id, err := sendSimpleMessage(domain, apiKey, from, to)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Send failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Queued ID:", id)
}

func sendSimpleMessage(domain, apiKey, from, to string) (string, error) {
	mg := mailgun.NewMailgun(domain, apiKey)

	m := mg.NewMessage(
		from,
		"Mailgun test from X-Flow",
		"Congratulations, you just sent an email with Mailgun from the X-Flow api-server test.",
		to,
	)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, id, err := mg.Send(ctx, m)
	return id, err
}
