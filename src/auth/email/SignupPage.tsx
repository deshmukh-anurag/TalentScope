import { Link } from "react-router-dom";
import { SignupForm } from "wasp/client/auth";
import { AuthLayout } from "../AuthLayout";

export function SignupPage() {
  return (
    <AuthLayout>
      <SignupForm
        additionalFields={[
          {
            name: "name",
            type: "input",
            label: "Name",
            validations: {
              required: "Name is required",
              minLength: {
                value: 2,
                message: "Name must be at least 2 characters long",
              },
            },
          },
          {
            name: "phone",
            type: "input",
            label: "Phone (optional)",
            validations: {},
          },
        ]}
      />
      <br />
      <span className="text-sm font-medium text-neutral-900">
        {"Already have an account? "}
        <Link to="/login" className="font-semibold underline">
          Go to login
        </Link>
        .
      </span>
    </AuthLayout>
  );
}
