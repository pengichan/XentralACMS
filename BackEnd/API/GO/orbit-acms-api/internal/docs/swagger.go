package docs

import "net/http"

const swaggerUIHTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Orbit ACMS API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/swagger/openapi.yaml",
      dom_id: "#swagger-ui",
      deepLinking: true,
      docExpansion: "list"
    });
  </script>
</body>
</html>
`

const openAPIYAML = `openapi: 3.0.3
info:
  title: Orbit ACMS API
  version: 1.0.0
  description: API documentation for Orbit ACMS backend services.
servers:
  - url: http://localhost:8080
    description: Local development server
tags:
  - name: System
  - name: Users
  - name: UserRoles
  - name: UserPermissions
  - name: ImageTypes
  - name: UserImages
paths:
  /health:
    get:
      tags: [System]
      summary: Health Check
      responses:
        "200":
          description: Service health response
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/HealthResponse"

  /api/users:
    get:
      tags: [Users]
      summary: List users
      responses:
        "200":
          description: User list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/User"
    post:
      tags: [Users]
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/User"
      responses:
        "201":
          description: User created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"

  /api/users/{id}:
    get:
      tags: [Users]
      summary: Get user by id
      parameters:
        - $ref: "#/components/parameters/IDPath"
      responses:
        "200":
          description: User
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
        "404":
          description: Not found
    put:
      tags: [Users]
      summary: Update user
      parameters:
        - $ref: "#/components/parameters/IDPath"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/User"
      responses:
        "200":
          description: User updated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
        "404":
          description: Not found
    delete:
      tags: [Users]
      summary: Delete user
      parameters:
        - $ref: "#/components/parameters/IDPath"
      responses:
        "204":
          description: User deleted
        "404":
          description: Not found

  /api/user-roles:
    get:
      tags: [UserRoles]
      summary: List user roles
      responses:
        "200":
          description: Role list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/UserRole"
    post:
      tags: [UserRoles]
      summary: Create user role
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UserRole"
      responses:
        "201":
          description: User role created

  /api/user-roles/{id}:
    get:
      tags: [UserRoles]
      summary: Get user role by id
      parameters:
        - $ref: "#/components/parameters/IDPath"
      responses:
        "200":
          description: User role
    put:
      tags: [UserRoles]
      summary: Update user role
      parameters:
        - $ref: "#/components/parameters/IDPath"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UserRole"
      responses:
        "200":
          description: User role updated
    delete:
      tags: [UserRoles]
      summary: Delete user role
      parameters:
        - $ref: "#/components/parameters/IDPath"
      responses:
        "204":
          description: User role deleted

  /api/user-permissions:
    get:
      tags: [UserPermissions]
      summary: List user permissions
      responses:
        "200":
          description: Permission list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/UserPermission"
    post:
      tags: [UserPermissions]
      summary: Create user permission
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UserPermission"
      responses:
        "201":
          description: User permission created

  /api/user-permissions/{id}:
    get:
      tags: [UserPermissions]
      summary: Get user permission by id
      parameters:
        - $ref: "#/components/parameters/IDPath"
      responses:
        "200":
          description: User permission
    put:
      tags: [UserPermissions]
      summary: Update user permission
      parameters:
        - $ref: "#/components/parameters/IDPath"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UserPermission"
      responses:
        "200":
          description: User permission updated
    delete:
      tags: [UserPermissions]
      summary: Delete user permission
      parameters:
        - $ref: "#/components/parameters/IDPath"
      responses:
        "204":
          description: User permission deleted

  /api/image-types:
    get:
      tags: [ImageTypes]
      summary: List image types
      responses:
        "200":
          description: Image type list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/ImageType"
    post:
      tags: [ImageTypes]
      summary: Create image type
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ImageType"
      responses:
        "201":
          description: Image type created

  /api/image-types/{id}:
    get:
      tags: [ImageTypes]
      summary: Get image type by id
      parameters:
        - $ref: "#/components/parameters/IDPath"
      responses:
        "200":
          description: Image type
    put:
      tags: [ImageTypes]
      summary: Update image type
      parameters:
        - $ref: "#/components/parameters/IDPath"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ImageType"
      responses:
        "200":
          description: Image type updated
    delete:
      tags: [ImageTypes]
      summary: Delete image type
      parameters:
        - $ref: "#/components/parameters/IDPath"
      responses:
        "204":
          description: Image type deleted

  /api/user-images:
    get:
      tags: [UserImages]
      summary: List user images
      responses:
        "200":
          description: User image list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/UserImage"
    post:
      tags: [UserImages]
      summary: Create user image
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UserImage"
      responses:
        "201":
          description: User image created

  /api/user-images/{id}:
    get:
      tags: [UserImages]
      summary: Get user image by id
      parameters:
        - $ref: "#/components/parameters/IDPath"
      responses:
        "200":
          description: User image
    put:
      tags: [UserImages]
      summary: Update user image
      parameters:
        - $ref: "#/components/parameters/IDPath"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/UserImage"
      responses:
        "200":
          description: User image updated
    delete:
      tags: [UserImages]
      summary: Delete user image
      parameters:
        - $ref: "#/components/parameters/IDPath"
      responses:
        "204":
          description: User image deleted

components:
  parameters:
    IDPath:
      name: id
      in: path
      required: true
      schema:
        type: string
  schemas:
    HealthResponse:
      type: object
      properties:
        status:
          type: string
          example: ok
        api:
          type: string
          example: orbit-acms-api
      required: [status, api]

    User:
      type: object
      properties:
        id: { type: string }
        userRoleId: { type: string }
        userId: { type: string }
        firstName: { type: string }
        lastName: { type: string }
        email: { type: string, format: email }
        mobileNo: { type: string }
        loginPassword: { type: string }
        remark: { type: string }
        lastLogin: { type: string, format: date-time }
        isActive: { type: boolean }
        isDeleted: { type: boolean }
        createdDate: { type: string, format: date-time }
        updatedDate: { type: string, format: date-time }
        createdBy: { type: string }
        updatedBy: { type: string }

    UserRole:
      type: object
      properties:
        id: { type: string }
        roleName: { type: string }
        description: { type: string }
        isDeleted: { type: boolean }
        createdDate: { type: string, format: date-time }
        updatedDate: { type: string, format: date-time }
        createdBy: { type: string }
        updatedBy: { type: string }

    UserPermission:
      type: object
      properties:
        id: { type: string }
        userRoleId: { type: string }
        moduleName: { type: string }
        canCreate: { type: boolean }
        canRead: { type: boolean }
        canUpdate: { type: boolean }
        canDelete: { type: boolean }
        isDeleted: { type: boolean }
        createdDate: { type: string, format: date-time }
        updatedDate: { type: string, format: date-time }
        createdBy: { type: string }
        updatedBy: { type: string }

    ImageType:
      type: object
      properties:
        id: { type: string }
        imageTypeName: { type: string }
        isDeleted: { type: boolean }
        createdDate: { type: string, format: date-time }
        updatedDate: { type: string, format: date-time }
        createdBy: { type: string }
        updatedBy: { type: string }

    UserImage:
      type: object
      properties:
        id: { type: string }
        userId: { type: string }
        imageTypeId: { type: string }
        imageName: { type: string }
        storedDirectory: { type: string }
        isDeleted: { type: boolean }
        uploadedDate: { type: string, format: date-time }
        uploadedBy: { type: string }
`

func SwaggerUIHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(swaggerUIHTML))
}

func OpenAPIHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	_, _ = w.Write([]byte(openAPIYAML))
}
